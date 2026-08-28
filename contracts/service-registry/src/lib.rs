#![no_std]

//! # PromptRail Service Registry
//!
//! An on-chain catalog of machine-payable services. Providers register a
//! service with a price and a payout address; the companion `payment-router`
//! contract resolves services from this registry with a real cross-contract
//! call when a payer buys one.
//!
//! Ported and extended from the earlier PromptRail registry contract: the
//! name/price validation, typed errors, `#[contractevent]` events, and TTL
//! handling carry over, while storage is re-keyed from one-endpoint-per-owner
//! to id-addressed services so a provider can list many services and callers
//! can paginate the active set.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String, Vec,
};

const MAX_NAME_LEN: u32 = 80;
const MAX_PRICE: i128 = 1_000_000_000_000;
/// Hard cap for one `list_active` page.
const MAX_PAGE: u32 = 50;

// Roughly ~30 days assuming ~5 second ledgers.
// This is only a retention target, not a security boundary.
const TTL_THRESHOLD: u32 = 100_000;
const TTL_EXTEND_TO: u32 = 518_400;

/// A registered service offering.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Service {
    pub id: u32,
    pub provider: Address,
    pub name: String,
    /// Price in the settlement token's stroops.
    pub price: i128,
    /// Where the payment router sends the funds.
    pub payout_address: Address,
    pub active: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Monotonic counter; also the total number of services ever registered.
    Count,
    /// Service record by id.
    Service(u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RegistryError {
    EmptyName = 1,
    NameTooLong = 2,
    InvalidPrice = 3,
    ServiceNotFound = 4,
    Unauthorized = 5,
    ServiceInactive = 6,
    PageTooLarge = 7,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServiceRegistered {
    #[topic]
    pub provider: Address,
    pub id: u32,
    pub name: String,
    pub price: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServiceUpdated {
    #[topic]
    pub provider: Address,
    pub id: u32,
    pub name: String,
    pub price: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServiceDeactivated {
    #[topic]
    pub provider: Address,
    pub id: u32,
}

#[contract]
pub struct ServiceRegistry;

#[contractimpl]
impl ServiceRegistry {
    /// Register a new service. Provider-authorized. Returns the new id.
    pub fn register_service(
        env: Env,
        provider: Address,
        name: String,
        price: i128,
        payout_address: Address,
    ) -> Result<u32, RegistryError> {
        provider.require_auth();

        validate_name(&name)?;
        validate_price(price)?;

        let id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0u32);

        let service = Service {
            id,
            provider: provider.clone(),
            name: name.clone(),
            price,
            payout_address,
            active: true,
        };

        Self::put_service(&env, &service);
        env.storage().instance().set(&DataKey::Count, &(id + 1));
        extend_contract_ttl(&env);

        ServiceRegistered {
            provider,
            id,
            name,
            price,
        }
        .publish(&env);

        Ok(id)
    }

    /// Replace a service's name, price, and payout address. Provider only.
    pub fn update_service(
        env: Env,
        id: u32,
        name: String,
        price: i128,
        payout_address: Address,
    ) -> Result<(), RegistryError> {
        let mut service = Self::load_service(&env, id)?;

        service.provider.require_auth();

        validate_name(&name)?;
        validate_price(price)?;

        service.name = name.clone();
        service.price = price;
        service.payout_address = payout_address;

        Self::put_service(&env, &service);
        extend_contract_ttl(&env);

        ServiceUpdated {
            provider: service.provider,
            id,
            name,
            price,
        }
        .publish(&env);

        Ok(())
    }

    /// Take a service off the market. Provider only. Idempotent.
    pub fn deactivate_service(env: Env, id: u32) -> Result<(), RegistryError> {
        let mut service = Self::load_service(&env, id)?;

        service.provider.require_auth();

        if service.active {
            service.active = false;
            Self::put_service(&env, &service);

            ServiceDeactivated {
                provider: service.provider,
                id,
            }
            .publish(&env);
        }

        extend_contract_ttl(&env);

        Ok(())
    }

    // ---------------------------------------------------------------------
    // Read-only views
    // ---------------------------------------------------------------------

    /// Fetch a single service by id.
    pub fn get_service(env: Env, id: u32) -> Result<Service, RegistryError> {
        Self::load_service(&env, id)
    }

    /// Resolve a service for payment: like `get_service`, but inactive
    /// services are an error. This is the entry point the payment router
    /// cross-calls.
    pub fn get_active_service(env: Env, id: u32) -> Result<Service, RegistryError> {
        let service = Self::load_service(&env, id)?;

        if !service.active {
            return Err(RegistryError::ServiceInactive);
        }

        Ok(service)
    }

    /// Total number of services ever registered.
    pub fn get_service_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0u32)
    }

    /// Page through active services. `offset` skips that many *active*
    /// services; `limit` caps the page size at `MAX_PAGE`.
    pub fn list_active(env: Env, offset: u32, limit: u32) -> Result<Vec<Service>, RegistryError> {
        if limit > MAX_PAGE {
            return Err(RegistryError::PageTooLarge);
        }

        let count = Self::get_service_count(env.clone());
        let mut page = Vec::new(&env);
        let mut skipped: u32 = 0;

        for id in 0..count {
            if page.len() >= limit {
                break;
            }

            let Some(service) = env
                .storage()
                .persistent()
                .get::<DataKey, Service>(&DataKey::Service(id))
            else {
                continue;
            };

            if !service.active {
                continue;
            }

            if skipped < offset {
                skipped += 1;
                continue;
            }

            page.push_back(service);
        }

        Ok(page)
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    fn load_service(env: &Env, id: u32) -> Result<Service, RegistryError> {
        env.storage()
            .persistent()
            .get(&DataKey::Service(id))
            .ok_or(RegistryError::ServiceNotFound)
    }

    fn put_service(env: &Env, service: &Service) {
        let key = DataKey::Service(service.id);
        env.storage().persistent().set(&key, service);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

fn validate_name(name: &String) -> Result<(), RegistryError> {
    if name.is_empty() {
        return Err(RegistryError::EmptyName);
    }

    if name.len() > MAX_NAME_LEN {
        return Err(RegistryError::NameTooLong);
    }

    Ok(())
}

fn validate_price(price: i128) -> Result<(), RegistryError> {
    if price <= 0 || price > MAX_PRICE {
        return Err(RegistryError::InvalidPrice);
    }

    Ok(())
}

fn extend_contract_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;

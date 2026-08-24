#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String,
};

const MAX_NAME_LEN: u32 = 80;
const MAX_PRICE: i128 = 1_000_000_000_000;

// Roughly ~30 days assuming ~5 second ledgers.
// This is only a retention target, not a security boundary.
const TTL_THRESHOLD: u32 = 100_000;
const TTL_EXTEND_TO: u32 = 518_400;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Endpoint {
    pub owner: Address,
    pub name: String,
    pub price: i128,
    pub active: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Endpoint(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RegistryError {
    EmptyName = 1,
    NameTooLong = 2,
    InvalidPrice = 3,
    EndpointNotFound = 4,
    EndpointExists = 5,
    Unauthorized = 6,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EndpointRegistered {
    #[topic]
    pub owner: Address,
    pub name: String,
    pub price: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceUpdated {
    #[topic]
    pub owner: Address,
    pub old_price: i128,
    pub new_price: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StatusChanged {
    #[topic]
    pub owner: Address,
    pub active: bool,
}

#[contract]
pub struct PromptRailRegistry;

#[contractimpl]
impl PromptRailRegistry {
    pub fn register(
        env: Env,
        owner: Address,
        name: String,
        price: i128,
    ) -> Result<Endpoint, RegistryError> {
        owner.require_auth();

        validate_name(&name)?;
        validate_price(price)?;

        let key = DataKey::Endpoint(owner.clone());

        if env.storage().persistent().has(&key) {
            return Err(RegistryError::EndpointExists);
        }

        let endpoint = Endpoint {
            owner: owner.clone(),
            name: name.clone(),
            price,
            active: true,
        };

        env.storage().persistent().set(&key, &endpoint);

        extend_entry_ttl(&env, &key);
        extend_contract_ttl(&env);

        EndpointRegistered { owner, name, price }.publish(&env);

        Ok(endpoint)
    }

    pub fn get(env: Env, owner: Address) -> Result<Endpoint, RegistryError> {
        let key = DataKey::Endpoint(owner);

        env.storage()
            .persistent()
            .get(&key)
            .ok_or(RegistryError::EndpointNotFound)
    }

    pub fn update_price(
        env: Env,
        owner: Address,
        new_price: i128,
    ) -> Result<Endpoint, RegistryError> {
        owner.require_auth();

        validate_price(new_price)?;

        let key = DataKey::Endpoint(owner.clone());

        let mut endpoint: Endpoint = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(RegistryError::EndpointNotFound)?;

        if endpoint.owner != owner {
            return Err(RegistryError::Unauthorized);
        }

        let old_price = endpoint.price;
        endpoint.price = new_price;

        env.storage().persistent().set(&key, &endpoint);

        extend_entry_ttl(&env, &key);
        extend_contract_ttl(&env);

        PriceUpdated {
            owner,
            old_price,
            new_price,
        }
        .publish(&env);

        Ok(endpoint)
    }

    pub fn set_active(env: Env, owner: Address, active: bool) -> Result<Endpoint, RegistryError> {
        owner.require_auth();

        let key = DataKey::Endpoint(owner.clone());

        let mut endpoint: Endpoint = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(RegistryError::EndpointNotFound)?;

        if endpoint.owner != owner {
            return Err(RegistryError::Unauthorized);
        }

        endpoint.active = active;

        env.storage().persistent().set(&key, &endpoint);

        extend_entry_ttl(&env, &key);
        extend_contract_ttl(&env);

        StatusChanged { owner, active }.publish(&env);

        Ok(endpoint)
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

fn extend_entry_ttl(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn extend_contract_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;

#![no_std]

//! # PromptRail Payment Router
//!
//! Pays for services listed in the [`service-registry`] contract. The core of
//! `pay_for_service` is a real on-chain cross-contract invocation: the router
//! calls the registry's `get_active_service` through the generated
//! [`ServiceRegistryClient`], resolves the price and payout address from the
//! returned [`Service`] struct, moves the settlement token from the payer to
//! the provider's payout address, and records a receipt.
//!
//! The registry client comes from the workspace dependency on the
//! `service-registry` crate — `#[contractimpl]` generates it — so the
//! resolution happens inside the router's own invocation, not as a separate
//! frontend-orchestrated call.

use service_registry::{Service, ServiceRegistryClient};
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, Vec,
};

// Roughly ~30 days assuming ~5 second ledgers.
const TTL_THRESHOLD: u32 = 100_000;
const TTL_EXTEND_TO: u32 = 518_400;

/// Proof of one routed service payment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub id: u32,
    pub payer: Address,
    pub service_id: u32,
    pub provider: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Settlement token address, set once by `initialize`.
    Token,
    /// Address of the service-registry contract, set once by `initialize`.
    Registry,
    /// Monotonic counter; also the total number of receipts ever recorded.
    Count,
    /// Receipt record by id.
    Receipt(u32),
    /// Receipt ids where the address is the payer.
    PayerReceipts(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RouterError {
    /// `initialize` has already been called.
    AlreadyInitialized = 1,
    /// The router has no token/registry configured yet.
    NotInitialized = 2,
    /// No receipt exists with the given id.
    ReceiptNotFound = 3,
    /// The registry has no service with the given id.
    ServiceNotFound = 4,
    /// The service exists but is deactivated.
    ServiceInactive = 5,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServicePaid {
    #[topic]
    pub payer: Address,
    #[topic]
    pub provider: Address,
    pub receipt_id: u32,
    pub service_id: u32,
    pub amount: i128,
}

#[contract]
pub struct PaymentRouter;

#[contractimpl]
impl PaymentRouter {
    /// Configure the settlement token and the registry this router resolves
    /// services from. Callable exactly once.
    pub fn initialize(
        env: Env,
        token: Address,
        registry_address: Address,
    ) -> Result<(), RouterError> {
        if env.storage().instance().has(&DataKey::Token) {
            return Err(RouterError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Token, &token);
        env.storage()
            .instance()
            .set(&DataKey::Registry, &registry_address);
        env.storage().instance().set(&DataKey::Count, &0u32);
        extend_contract_ttl(&env);

        Ok(())
    }

    /// Pay for a registered service.
    ///
    /// Cross-contract flow, all inside this one invocation:
    /// 1. Call the registry's `get_active_service(service_id)` via its
    ///    generated client — a missing or inactive service surfaces as a
    ///    typed [`RouterError`].
    /// 2. Transfer `service.price` of the settlement token from `payer` to
    ///    `service.payout_address`.
    /// 3. Record a [`Receipt`] and emit [`ServicePaid`].
    ///
    /// Returns the receipt id.
    pub fn pay_for_service(env: Env, payer: Address, service_id: u32) -> Result<u32, RouterError> {
        payer.require_auth();

        let token = Self::config_address(&env, DataKey::Token)?;
        let registry = Self::config_address(&env, DataKey::Registry)?;

        // Real contract-to-contract invocation into the registry.
        let service = Self::resolve_service(&env, &registry, service_id)?;

        token::Client::new(&env, &token).transfer(&payer, &service.payout_address, &service.price);

        let id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0u32);

        let receipt = Receipt {
            id,
            payer: payer.clone(),
            service_id,
            provider: service.provider.clone(),
            amount: service.price,
            timestamp: env.ledger().timestamp(),
        };

        let key = DataKey::Receipt(id);
        env.storage().persistent().set(&key, &receipt);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.storage().instance().set(&DataKey::Count, &(id + 1));

        Self::push_payer_index(&env, &payer, id);
        extend_contract_ttl(&env);

        ServicePaid {
            payer,
            provider: service.provider,
            receipt_id: id,
            service_id,
            amount: service.price,
        }
        .publish(&env);

        Ok(id)
    }

    // ---------------------------------------------------------------------
    // Read-only views
    // ---------------------------------------------------------------------

    /// Fetch a single receipt by id.
    pub fn get_receipt(env: Env, id: u32) -> Result<Receipt, RouterError> {
        env.storage()
            .persistent()
            .get(&DataKey::Receipt(id))
            .ok_or(RouterError::ReceiptNotFound)
    }

    /// Total number of receipts ever recorded.
    pub fn get_receipt_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0u32)
    }

    /// Ids of receipts paid by `payer`.
    pub fn get_payer_receipts(env: Env, payer: Address) -> Vec<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::PayerReceipts(payer))
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// The configured settlement token address.
    pub fn get_token(env: Env) -> Result<Address, RouterError> {
        Self::config_address(&env, DataKey::Token)
    }

    /// The configured registry contract address.
    pub fn get_registry(env: Env) -> Result<Address, RouterError> {
        Self::config_address(&env, DataKey::Registry)
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    fn config_address(env: &Env, key: DataKey) -> Result<Address, RouterError> {
        env.storage()
            .instance()
            .get(&key)
            .ok_or(RouterError::NotInitialized)
    }

    /// Cross-call the registry and translate its errors into router errors.
    fn resolve_service(
        env: &Env,
        registry: &Address,
        service_id: u32,
    ) -> Result<Service, RouterError> {
        let client = ServiceRegistryClient::new(env, registry);

        match client.try_get_active_service(&service_id) {
            Ok(Ok(service)) => Ok(service),
            Err(Ok(service_registry::RegistryError::ServiceInactive)) => {
                Err(RouterError::ServiceInactive)
            }
            _ => Err(RouterError::ServiceNotFound),
        }
    }

    fn push_payer_index(env: &Env, payer: &Address, id: u32) {
        let key = DataKey::PayerReceipts(payer.clone());
        let mut ids: Vec<u32> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env));

        ids.push_back(id);
        env.storage().persistent().set(&key, &ids);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
    }
}

fn extend_contract_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;

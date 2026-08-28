#![no_std]

//! # PromptRail Payment Tracker
//!
//! An escrow-backed payment tracker for machine-to-machine settlement.
//!
//! A sender creates a payment (single or batched across many recipients). The
//! settlement token is moved from the sender into this contract and held while
//! the payment sits in [`PaymentStatus::Pending`]. The sender then either
//! releases the funds to the recipient (`complete_payment`) or takes them back
//! (`cancel_payment`). Every payment is addressable by a monotonic id and is
//! indexed for both the sender and the recipient so the UI can list activity
//! without scanning the whole ledger.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, Vec,
};

/// Ledgers in roughly one day at ~5s per ledger.
const DAY_IN_LEDGERS: u32 = 17_280;
/// How far to push storage entry lifetimes on each touch (~30 days).
const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
/// Refresh an entry once it drops below ~29 days of remaining life.
const LIFETIME_THRESHOLD: u32 = BUMP_AMOUNT - DAY_IN_LEDGERS;
/// Upper bound on recipients in a single `create_batch` call.
const MAX_BATCH: u32 = 100;

/// Lifecycle state of a tracked payment.
///
/// Only `Pending` payments may transition; `Completed` and `Cancelled` are
/// terminal, which is what makes double-complete and double-cancel impossible.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PaymentStatus {
    Pending = 0,
    Completed = 1,
    Cancelled = 2,
}

/// A single tracked payment held in escrow by this contract.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Payment {
    pub id: u32,
    pub from: Address,
    pub to: Address,
    pub amount: i128,
    pub status: PaymentStatus,
    pub created_at: u64,
    pub updated_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Settlement token address, set once by `initialize`.
    Token,
    /// Monotonic counter; also the total number of payments ever created.
    Count,
    /// Payment record by id.
    Payment(u32),
    /// Payment ids where the address is the sender.
    Sent(Address),
    /// Payment ids where the address is the recipient.
    Received(Address),
}

#[contracterror]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Error {
    /// `initialize` has already been called.
    AlreadyInitialized = 1,
    /// The contract has no settlement token configured yet.
    NotInitialized = 2,
    /// Amount was zero or negative.
    InvalidAmount = 3,
    /// No payment exists with the given id.
    PaymentNotFound = 4,
    /// The payment is already Completed or Cancelled.
    NotPending = 5,
    /// `create_batch` was called with no recipients.
    EmptyBatch = 6,
    /// `create_batch` exceeded `MAX_BATCH` recipients.
    BatchTooLarge = 7,
    /// Sender and recipient are the same address.
    SelfPayment = 8,
}

// ---------------------------------------------------------------------------
// Events
//
// Declared with `#[contractevent]` so they land in the contract interface spec
// and stay decodable by explorers and generated clients. `from` and `to` are
// topics, which is what lets an indexer subscribe to one counterparty.
// ---------------------------------------------------------------------------

/// Emitted once, when the settlement token is configured.
#[contractevent]
pub struct TrackerInitialized {
    pub token: Address,
}

/// Emitted when funds enter escrow and a `Pending` payment is recorded.
#[contractevent]
pub struct PaymentCreated {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub id: u32,
    pub amount: i128,
}

/// Emitted when escrow is released to the recipient.
#[contractevent]
pub struct PaymentCompleted {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub id: u32,
    pub amount: i128,
}

/// Emitted when escrow is refunded to the sender.
#[contractevent]
pub struct PaymentCancelled {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub id: u32,
    pub amount: i128,
}

#[contract]
pub struct PaymentTracker;

#[contractimpl]
impl PaymentTracker {
    /// Configure the settlement token. Callable exactly once.
    ///
    /// On testnet this is the native XLM Stellar Asset Contract.
    pub fn initialize(env: Env, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Token) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Count, &0u32);
        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);

        TrackerInitialized { token }.publish(&env);

        Ok(())
    }

    /// Escrow `amount` from `from` and record a new `Pending` payment to `to`.
    ///
    /// Returns the new payment id. Requires authorization from `from`, which
    /// also covers the token transfer into this contract.
    pub fn create_payment(
        env: Env,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<u32, Error> {
        from.require_auth();

        let token = Self::token_address(&env)?;
        let id = Self::escrow(&env, &token, &from, &to, amount)?;

        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);

        Ok(id)
    }

    /// Escrow one payment per recipient in a single invocation.
    ///
    /// This is the multi-address flow: each entry becomes an independent
    /// `Pending` payment that can be completed or cancelled on its own.
    /// Returns the new ids in the same order as `recipients`.
    pub fn create_batch(
        env: Env,
        from: Address,
        recipients: Vec<(Address, i128)>,
    ) -> Result<Vec<u32>, Error> {
        from.require_auth();

        if recipients.is_empty() {
            return Err(Error::EmptyBatch);
        }
        if recipients.len() > MAX_BATCH {
            return Err(Error::BatchTooLarge);
        }

        let token = Self::token_address(&env)?;
        let mut ids = Vec::new(&env);

        for (to, amount) in recipients.iter() {
            ids.push_back(Self::escrow(&env, &token, &from, &to, amount)?);
        }

        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);

        Ok(ids)
    }

    /// Release an escrowed payment to its recipient. Sender-authorized.
    pub fn complete_payment(env: Env, id: u32) -> Result<(), Error> {
        Self::settle(env, id, PaymentStatus::Completed)
    }

    /// Refund an escrowed payment back to its sender. Sender-authorized.
    pub fn cancel_payment(env: Env, id: u32) -> Result<(), Error> {
        Self::settle(env, id, PaymentStatus::Cancelled)
    }

    // ---------------------------------------------------------------------
    // Read-only views
    // ---------------------------------------------------------------------

    /// Fetch a single payment by id.
    pub fn get_payment(env: Env, id: u32) -> Result<Payment, Error> {
        env.storage()
            .persistent()
            .get::<DataKey, Payment>(&DataKey::Payment(id))
            .ok_or(Error::PaymentNotFound)
    }

    /// Total number of payments ever created.
    pub fn get_payment_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0u32)
    }

    /// Ids of payments sent by `addr`.
    pub fn get_sent_ids(env: Env, addr: Address) -> Vec<u32> {
        Self::index(&env, DataKey::Sent(addr))
    }

    /// Ids of payments received by `addr`.
    pub fn get_received_ids(env: Env, addr: Address) -> Vec<u32> {
        Self::index(&env, DataKey::Received(addr))
    }

    /// The configured settlement token address.
    pub fn get_token(env: Env) -> Result<Address, Error> {
        Self::token_address(&env)
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    fn token_address(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get::<DataKey, Address>(&DataKey::Token)
            .ok_or(Error::NotInitialized)
    }

    fn index(env: &Env, key: DataKey) -> Vec<u32> {
        env.storage()
            .persistent()
            .get::<DataKey, Vec<u32>>(&key)
            .unwrap_or_else(|| Vec::new(env))
    }

    /// Move `amount` into escrow and write the `Pending` record + indexes.
    fn escrow(
        env: &Env,
        token: &Address,
        from: &Address,
        to: &Address,
        amount: i128,
    ) -> Result<u32, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if from == to {
            return Err(Error::SelfPayment);
        }

        // Pull the funds in before recording anything, so a failed transfer
        // leaves no orphaned payment behind.
        token::Client::new(env, token).transfer(from, &env.current_contract_address(), &amount);

        let id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::Count)
            .unwrap_or(0u32);
        let now = env.ledger().timestamp();

        let payment = Payment {
            id,
            from: from.clone(),
            to: to.clone(),
            amount,
            status: PaymentStatus::Pending,
            created_at: now,
            updated_at: now,
        };

        Self::put_payment(env, &payment);
        env.storage().instance().set(&DataKey::Count, &(id + 1));

        Self::push_index(env, DataKey::Sent(from.clone()), id);
        Self::push_index(env, DataKey::Received(to.clone()), id);

        PaymentCreated {
            from: from.clone(),
            to: to.clone(),
            id,
            amount,
        }
        .publish(env);

        Ok(id)
    }

    /// Shared transition for `complete_payment` / `cancel_payment`.
    ///
    /// Both are authorized by the *sender*: they either release the escrow to
    /// the recipient or claw it back. `status` decides the payout target.
    fn settle(env: Env, id: u32, status: PaymentStatus) -> Result<(), Error> {
        let mut payment = env
            .storage()
            .persistent()
            .get::<DataKey, Payment>(&DataKey::Payment(id))
            .ok_or(Error::PaymentNotFound)?;

        payment.from.require_auth();

        // Terminal states never transition again: this is the double-complete
        // and double-cancel guard.
        if payment.status != PaymentStatus::Pending {
            return Err(Error::NotPending);
        }

        let token = Self::token_address(&env)?;
        // Completing pays the recipient; cancelling returns the escrow to the
        // sender. Everything else about the two paths is identical.
        let recipient = match status {
            PaymentStatus::Completed => payment.to.clone(),
            PaymentStatus::Cancelled => payment.from.clone(),
            PaymentStatus::Pending => return Err(Error::NotPending),
        };

        payment.status = status;
        payment.updated_at = env.ledger().timestamp();
        Self::put_payment(&env, &payment);

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &recipient,
            &payment.amount,
        );

        match status {
            PaymentStatus::Completed => PaymentCompleted {
                from: payment.from.clone(),
                to: payment.to.clone(),
                id,
                amount: payment.amount,
            }
            .publish(&env),
            PaymentStatus::Cancelled => PaymentCancelled {
                from: payment.from.clone(),
                to: payment.to.clone(),
                id,
                amount: payment.amount,
            }
            .publish(&env),
            PaymentStatus::Pending => unreachable!(),
        }

        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);

        Ok(())
    }

    fn put_payment(env: &Env, payment: &Payment) {
        let key = DataKey::Payment(payment.id);
        env.storage().persistent().set(&key, payment);
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
    }

    fn push_index(env: &Env, key: DataKey, id: u32) {
        let mut ids = Self::index(env, key.clone());
        ids.push_back(id);
        env.storage().persistent().set(&key, &ids);
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
    }
}

mod test;

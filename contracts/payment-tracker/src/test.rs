#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events as _, Ledger as _},
    token, vec, Address, Env, Event,
};

/// Amount every test account is funded with, in stroops.
const FUNDING: i128 = 1_000_000_000;

struct Harness<'a> {
    env: Env,
    client: PaymentTrackerClient<'a>,
    contract_id: Address,
    token: token::Client<'a>,
    alice: Address,
    bob: Address,
    carol: Address,
}

/// Deploy a Stellar Asset Contract plus the tracker, fund three accounts, and
/// wire the tracker to the token.
fn setup<'a>() -> Harness<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_id = sac.address();

    let token = token::Client::new(&env, &token_id);
    let minter = token::StellarAssetClient::new(&env, &token_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    for account in [&alice, &bob, &carol] {
        minter.mint(account, &FUNDING);
    }

    let contract_id = env.register(PaymentTracker, ());
    let client = PaymentTrackerClient::new(&env, &contract_id);
    client.initialize(&token_id);

    Harness {
        env,
        client,
        contract_id,
        token,
        alice,
        bob,
        carol,
    }
}

#[test]
fn create_and_complete_moves_funds_to_recipient() {
    let h = setup();
    let amount = 250_000i128;

    let id = h.client.create_payment(&h.alice, &h.bob, &amount);
    assert_eq!(id, 0);

    // Escrow: the sender is debited and the contract holds the funds. The
    // recipient has not been paid yet.
    assert_eq!(h.token.balance(&h.alice), FUNDING - amount);
    assert_eq!(h.token.balance(&h.contract_id), amount);
    assert_eq!(h.token.balance(&h.bob), FUNDING);

    let payment = h.client.get_payment(&id);
    assert_eq!(payment.status, PaymentStatus::Pending);
    assert_eq!(payment.from, h.alice);
    assert_eq!(payment.to, h.bob);
    assert_eq!(payment.amount, amount);

    h.client.complete_payment(&id);

    // Release: escrow drains to the recipient.
    assert_eq!(h.token.balance(&h.alice), FUNDING - amount);
    assert_eq!(h.token.balance(&h.contract_id), 0);
    assert_eq!(h.token.balance(&h.bob), FUNDING + amount);

    let settled = h.client.get_payment(&id);
    assert_eq!(settled.status, PaymentStatus::Completed);
    assert!(settled.updated_at >= settled.created_at);
}

#[test]
fn cancel_refunds_the_sender() {
    let h = setup();
    let amount = 75_000i128;

    let id = h.client.create_payment(&h.alice, &h.bob, &amount);
    assert_eq!(h.token.balance(&h.alice), FUNDING - amount);

    h.client.cancel_payment(&id);

    // The sender is made whole and the recipient never receives anything.
    assert_eq!(h.token.balance(&h.alice), FUNDING);
    assert_eq!(h.token.balance(&h.contract_id), 0);
    assert_eq!(h.token.balance(&h.bob), FUNDING);
    assert_eq!(h.client.get_payment(&id).status, PaymentStatus::Cancelled);
}

#[test]
fn batch_creates_one_payment_per_recipient() {
    let h = setup();

    let ids = h.client.create_batch(
        &h.alice,
        &vec![
            &h.env,
            (h.bob.clone(), 10_000i128),
            (h.carol.clone(), 20_000i128),
        ],
    );

    assert_eq!(ids, vec![&h.env, 0u32, 1u32]);
    assert_eq!(h.client.get_payment_count(), 2);

    // One invocation, one debit per recipient, all held in escrow.
    assert_eq!(h.token.balance(&h.alice), FUNDING - 30_000);
    assert_eq!(h.token.balance(&h.contract_id), 30_000);

    let first = h.client.get_payment(&0);
    let second = h.client.get_payment(&1);
    assert_eq!(first.to, h.bob);
    assert_eq!(first.amount, 10_000);
    assert_eq!(second.to, h.carol);
    assert_eq!(second.amount, 20_000);

    // Each entry settles independently.
    h.client.complete_payment(&0);
    h.client.cancel_payment(&1);

    assert_eq!(h.token.balance(&h.bob), FUNDING + 10_000);
    assert_eq!(h.token.balance(&h.carol), FUNDING);
    assert_eq!(h.token.balance(&h.alice), FUNDING - 10_000);
    assert_eq!(h.token.balance(&h.contract_id), 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn double_complete_is_rejected() {
    let h = setup();
    let id = h.client.create_payment(&h.alice, &h.bob, &1_000i128);

    h.client.complete_payment(&id);
    // Completed is terminal: the second release must not pay out twice.
    h.client.complete_payment(&id);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn cancel_after_complete_is_rejected() {
    let h = setup();
    let id = h.client.create_payment(&h.alice, &h.bob, &1_000i128);

    h.client.complete_payment(&id);
    h.client.cancel_payment(&id);
}

#[test]
fn initialize_is_callable_once() {
    let h = setup();
    let other = Address::generate(&h.env);

    let result = h.client.try_initialize(&other);
    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn rejects_non_positive_amounts() {
    let h = setup();

    assert_eq!(
        h.client.try_create_payment(&h.alice, &h.bob, &0i128),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        h.client.try_create_payment(&h.alice, &h.bob, &-5i128),
        Err(Ok(Error::InvalidAmount))
    );

    // Nothing was recorded and no funds moved.
    assert_eq!(h.client.get_payment_count(), 0);
    assert_eq!(h.token.balance(&h.alice), FUNDING);
}

#[test]
fn rejects_self_payment_and_empty_batch() {
    let h = setup();

    assert_eq!(
        h.client.try_create_payment(&h.alice, &h.alice, &100i128),
        Err(Ok(Error::SelfPayment))
    );
    assert_eq!(
        h.client.try_create_batch(&h.alice, &vec![&h.env]),
        Err(Ok(Error::EmptyBatch))
    );
}

#[test]
fn unknown_payment_id_is_reported() {
    let h = setup();

    assert_eq!(
        h.client.try_get_payment(&99),
        Err(Ok(Error::PaymentNotFound))
    );
    assert_eq!(
        h.client.try_complete_payment(&99),
        Err(Ok(Error::PaymentNotFound))
    );
}

#[test]
fn indexes_track_both_sides_of_a_payment() {
    let h = setup();

    h.client.create_payment(&h.alice, &h.bob, &1_000i128);
    h.client.create_payment(&h.alice, &h.carol, &2_000i128);
    h.client.create_payment(&h.bob, &h.alice, &3_000i128);

    assert_eq!(h.client.get_sent_ids(&h.alice), vec![&h.env, 0u32, 1u32]);
    assert_eq!(h.client.get_received_ids(&h.alice), vec![&h.env, 2u32]);
    assert_eq!(h.client.get_sent_ids(&h.bob), vec![&h.env, 2u32]);
    assert_eq!(h.client.get_received_ids(&h.bob), vec![&h.env, 0u32]);
    assert_eq!(h.client.get_received_ids(&h.carol), vec![&h.env, 1u32]);
    assert_eq!(h.client.get_payment_count(), 3);
}

#[test]
fn timestamps_reflect_the_ledger() {
    let h = setup();

    h.env.ledger().set_timestamp(1_700_000_000);
    let id = h.client.create_payment(&h.alice, &h.bob, &500i128);
    let created = h.client.get_payment(&id);
    assert_eq!(created.created_at, 1_700_000_000);
    assert_eq!(created.updated_at, 1_700_000_000);

    h.env.ledger().set_timestamp(1_700_000_600);
    h.client.complete_payment(&id);
    let settled = h.client.get_payment(&id);
    assert_eq!(settled.created_at, 1_700_000_000);
    assert_eq!(settled.updated_at, 1_700_000_600);
}

/// Assert an event is present in the host's current event buffer.
///
/// The SAC emits its own transfer events alongside ours, so this checks for
/// presence rather than matching the whole stream.
fn assert_emitted(h: &Harness, expected: soroban_sdk::xdr::ContractEvent) {
    let all = h.env.events().all();
    assert!(
        all.events().contains(&expected),
        "missing expected event: {expected:?}"
    );
}

#[test]
fn lifecycle_emits_contract_events() {
    let h = setup();
    let amount = 4_000i128;

    let id = h.client.create_payment(&h.alice, &h.bob, &amount);
    assert_emitted(
        &h,
        PaymentCreated {
            from: h.alice.clone(),
            to: h.bob.clone(),
            id,
            amount,
        }
        .to_xdr(&h.env, &h.contract_id),
    );

    h.client.complete_payment(&id);
    assert_emitted(
        &h,
        PaymentCompleted {
            from: h.alice.clone(),
            to: h.bob.clone(),
            id,
            amount,
        }
        .to_xdr(&h.env, &h.contract_id),
    );

    let second = h.client.create_payment(&h.alice, &h.carol, &amount);
    h.client.cancel_payment(&second);
    assert_emitted(
        &h,
        PaymentCancelled {
            from: h.alice.clone(),
            to: h.carol.clone(),
            id: second,
            amount,
        }
        .to_xdr(&h.env, &h.contract_id),
    );
}

#[test]
fn token_address_is_exposed_for_the_ui() {
    let h = setup();
    assert_eq!(h.client.get_token(), h.token.address);
}

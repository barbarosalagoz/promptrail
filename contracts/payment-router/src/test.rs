#![cfg(test)]

//! Router unit tests plus integration tests that register the router and the
//! service registry together in one env, so `pay_for_service` exercises the
//! real cross-contract invocation path.

extern crate std;

use super::*;
use service_registry::{ServiceRegistry, ServiceRegistryClient};
use soroban_sdk::{
    testutils::{Address as _, Events as _},
    token, Address, Env, Event, String,
};

const FUNDING: i128 = 1_000_000_000;
const PRICE: i128 = 50_000_000;

struct Harness<'a> {
    env: Env,
    router: PaymentRouterClient<'a>,
    router_id: Address,
    registry: ServiceRegistryClient<'a>,
    token: token::Client<'a>,
    minter: token::StellarAssetClient<'a>,
    payer: Address,
    provider: Address,
    payout: Address,
}

/// Deploy the registry, the router (initialized with the registry's address),
/// and a Stellar Asset Contract; fund the payer.
fn setup<'a>() -> Harness<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_id = sac.address();
    let token = token::Client::new(&env, &token_id);
    let minter = token::StellarAssetClient::new(&env, &token_id);

    let registry_id = env.register(ServiceRegistry, ());
    let registry = ServiceRegistryClient::new(&env, &registry_id);

    let router_id = env.register(PaymentRouter, ());
    let router = PaymentRouterClient::new(&env, &router_id);
    router.initialize(&token_id, &registry_id);

    let payer = Address::generate(&env);
    let provider = Address::generate(&env);
    let payout = Address::generate(&env);

    minter.mint(&payer, &FUNDING);

    Harness {
        env,
        router,
        router_id,
        registry,
        token,
        minter,
        payer,
        provider,
        payout,
    }
}

fn register_demo_service(h: &Harness) -> u32 {
    h.registry.register_service(
        &h.provider,
        &String::from_str(&h.env, "Translation API"),
        &PRICE,
        &h.payout,
    )
}

// -------------------------------------------------------------------------
// Integration: real cross-contract path
// -------------------------------------------------------------------------

#[test]
fn integration_pay_for_service_happy_path() {
    let h = setup();
    let service_id = register_demo_service(&h);

    let receipt_id = h.router.pay_for_service(&h.payer, &service_id);
    assert_eq!(receipt_id, 0);

    // Assert the event immediately: the host's event buffer only holds the
    // latest invocation, so later view calls would clear it.
    let paid = ServicePaid {
        payer: h.payer.clone(),
        provider: h.provider.clone(),
        receipt_id,
        service_id,
        amount: PRICE,
    }
    .to_xdr(&h.env, &h.router_id);

    let all = h.env.events().all();
    assert!(all.events().contains(&paid));

    // The router resolved price + payout via the registry cross-call and
    // moved the funds payer -> payout in the same invocation.
    assert_eq!(h.token.balance(&h.payer), FUNDING - PRICE);
    assert_eq!(h.token.balance(&h.payout), PRICE);

    let receipt = h.router.get_receipt(&receipt_id);
    assert_eq!(receipt.payer, h.payer);
    assert_eq!(receipt.service_id, service_id);
    assert_eq!(receipt.provider, h.provider);
    assert_eq!(receipt.amount, PRICE);

    assert_eq!(h.router.get_receipt_count(), 1);
    assert_eq!(
        h.router.get_payer_receipts(&h.payer),
        soroban_sdk::vec![&h.env, 0u32]
    );
}

#[test]
fn integration_inactive_service_is_rejected() {
    let h = setup();
    let service_id = register_demo_service(&h);

    h.registry.deactivate_service(&service_id);

    // The registry's inactive error crosses the contract boundary and comes
    // back as the router's typed error.
    assert_eq!(
        h.router.try_pay_for_service(&h.payer, &service_id),
        Err(Ok(RouterError::ServiceInactive))
    );

    // Nothing moved, nothing recorded.
    assert_eq!(h.token.balance(&h.payer), FUNDING);
    assert_eq!(h.router.get_receipt_count(), 0);
}

#[test]
fn integration_unknown_service_is_rejected() {
    let h = setup();

    assert_eq!(
        h.router.try_pay_for_service(&h.payer, &99),
        Err(Ok(RouterError::ServiceNotFound))
    );
    assert_eq!(h.token.balance(&h.payer), FUNDING);
}

#[test]
fn integration_payment_requires_payer_auth() {
    let h = setup();
    let service_id = register_demo_service(&h);

    // No auth mocked at all: the payer's require_auth must abort the call.
    h.env.set_auths(&[]);

    let result = h.router.try_pay_for_service(&h.payer, &service_id);

    assert!(result.is_err());
    assert_eq!(h.router.get_receipt_count(), 0);
}

#[test]
fn integration_insufficient_balance_fails_without_receipt() {
    let h = setup();
    let service_id = register_demo_service(&h);

    let broke = Address::generate(&h.env);
    h.minter.mint(&broke, &(PRICE - 1));

    // The SAC transfer aborts inside the cross-contract flow.
    let result = h.router.try_pay_for_service(&broke, &service_id);

    assert!(result.is_err());
    assert_eq!(h.token.balance(&broke), PRICE - 1);
    assert_eq!(h.token.balance(&h.payout), 0);
    assert_eq!(h.router.get_receipt_count(), 0);
}

#[test]
fn integration_price_update_applies_to_later_payments() {
    let h = setup();
    let service_id = register_demo_service(&h);

    h.router.pay_for_service(&h.payer, &service_id);

    let new_price = PRICE * 2;
    h.registry.update_service(
        &service_id,
        &String::from_str(&h.env, "Translation API v2"),
        &new_price,
        &h.payout,
    );

    h.router.pay_for_service(&h.payer, &service_id);

    // Second receipt reflects the registry's updated price — resolved at
    // payment time via the cross-call, not cached in the router.
    assert_eq!(h.router.get_receipt(&1).amount, new_price);
    assert_eq!(h.token.balance(&h.payout), PRICE + new_price);
}

// -------------------------------------------------------------------------
// Router unit behavior
// -------------------------------------------------------------------------

#[test]
fn initialize_is_callable_once() {
    let h = setup();
    let other = Address::generate(&h.env);

    assert_eq!(
        h.router.try_initialize(&other, &other),
        Err(Ok(RouterError::AlreadyInitialized))
    );
}

#[test]
fn uninitialized_router_rejects_payments() {
    let env = Env::default();
    env.mock_all_auths();

    let router_id = env.register(PaymentRouter, ());
    let router = PaymentRouterClient::new(&env, &router_id);
    let payer = Address::generate(&env);

    assert_eq!(
        router.try_pay_for_service(&payer, &0),
        Err(Ok(RouterError::NotInitialized))
    );
}

#[test]
fn config_views_expose_token_and_registry() {
    let h = setup();

    assert_eq!(h.router.get_token(), h.token.address);
    assert_eq!(h.router.get_registry(), h.registry.address);
}

#[test]
fn unknown_receipt_is_reported() {
    let h = setup();

    assert_eq!(
        h.router.try_get_receipt(&7),
        Err(Ok(RouterError::ReceiptNotFound))
    );
}

#[test]
fn payer_index_tracks_multiple_receipts() {
    let h = setup();
    let first = register_demo_service(&h);
    let second = h.registry.register_service(
        &h.provider,
        &String::from_str(&h.env, "Image Gen"),
        &(PRICE / 2),
        &h.payout,
    );

    h.router.pay_for_service(&h.payer, &first);
    h.router.pay_for_service(&h.payer, &second);
    h.router.pay_for_service(&h.payer, &first);

    assert_eq!(
        h.router.get_payer_receipts(&h.payer),
        soroban_sdk::vec![&h.env, 0u32, 1u32, 2u32]
    );
    assert_eq!(h.router.get_receipt(&1).service_id, second);
    assert_eq!(h.router.get_receipt_count(), 3);
}

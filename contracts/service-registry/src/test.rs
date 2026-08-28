#![cfg(test)]

//! Ported from the earlier PromptRail registry test suite and extended for
//! id-addressed services, payout addresses, and pagination.

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{
        Address as _, AuthorizedFunction, AuthorizedInvocation, Events as _, MockAuth,
        MockAuthInvoke,
    },
    vec, Address, Env, Event, IntoVal, Symbol,
};

struct Harness<'a> {
    env: Env,
    client: ServiceRegistryClient<'a>,
    contract_id: Address,
    provider: Address,
    payout: Address,
}

fn setup<'a>() -> Harness<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(ServiceRegistry, ());
    let client = ServiceRegistryClient::new(&env, &contract_id);
    let provider = Address::generate(&env);
    let payout = Address::generate(&env);

    Harness {
        env,
        client,
        contract_id,
        provider,
        payout,
    }
}

fn name(env: &Env, value: &str) -> String {
    String::from_str(env, value)
}

#[test]
fn register_service_successfully() {
    let h = setup();

    let id = h.client.register_service(
        &h.provider,
        &name(&h.env, "Translation API"),
        &50_000_000,
        &h.payout,
    );

    assert_eq!(id, 0);
    assert_eq!(h.client.get_service_count(), 1);

    let service = h.client.get_service(&id);
    assert_eq!(service.provider, h.provider);
    assert_eq!(service.name, name(&h.env, "Translation API"));
    assert_eq!(service.price, 50_000_000);
    assert_eq!(service.payout_address, h.payout);
    assert!(service.active);
}

#[test]
fn register_requires_provider_auth() {
    let h = setup();

    h.client
        .register_service(&h.provider, &name(&h.env, "API"), &1_000, &h.payout);

    assert_eq!(
        h.env.auths(),
        std::vec![(
            h.provider.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    h.contract_id.clone(),
                    Symbol::new(&h.env, "register_service"),
                    (
                        h.provider.clone(),
                        name(&h.env, "API"),
                        1_000i128,
                        h.payout.clone(),
                    )
                        .into_val(&h.env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
}

#[test]
fn register_without_auth_fails() {
    let env = Env::default();
    let contract_id = env.register(ServiceRegistry, ());
    let client = ServiceRegistryClient::new(&env, &contract_id);
    let provider = Address::generate(&env);
    let payout = Address::generate(&env);

    let result =
        client.try_register_service(&provider, &String::from_str(&env, "API"), &1_000, &payout);

    assert!(result.is_err());
}

#[test]
fn rejects_invalid_names_and_prices() {
    let h = setup();

    assert_eq!(
        h.client
            .try_register_service(&h.provider, &name(&h.env, ""), &1_000, &h.payout),
        Err(Ok(RegistryError::EmptyName))
    );

    let oversized = "x".repeat(81);
    assert_eq!(
        h.client
            .try_register_service(&h.provider, &name(&h.env, &oversized), &1_000, &h.payout),
        Err(Ok(RegistryError::NameTooLong))
    );

    for bad_price in [0i128, -5, MAX_PRICE + 1] {
        assert_eq!(
            h.client
                .try_register_service(&h.provider, &name(&h.env, "API"), &bad_price, &h.payout),
            Err(Ok(RegistryError::InvalidPrice))
        );
    }

    assert_eq!(h.client.get_service_count(), 0);
}

#[test]
fn provider_can_register_multiple_services() {
    let h = setup();

    let a = h
        .client
        .register_service(&h.provider, &name(&h.env, "Translation"), &1_000, &h.payout);
    let b = h
        .client
        .register_service(&h.provider, &name(&h.env, "Image Gen"), &2_000, &h.payout);

    assert_eq!((a, b), (0, 1));
    assert_eq!(h.client.get_service_count(), 2);
}

#[test]
fn missing_service_returns_error() {
    let h = setup();

    assert_eq!(
        h.client.try_get_service(&42),
        Err(Ok(RegistryError::ServiceNotFound))
    );
}

#[test]
fn update_service_replaces_fields() {
    let h = setup();
    let new_payout = Address::generate(&h.env);

    let id = h
        .client
        .register_service(&h.provider, &name(&h.env, "API"), &1_000, &h.payout);

    h.client
        .update_service(&id, &name(&h.env, "API v2"), &2_500, &new_payout);

    let service = h.client.get_service(&id);
    assert_eq!(service.name, name(&h.env, "API v2"));
    assert_eq!(service.price, 2_500);
    assert_eq!(service.payout_address, new_payout);
    assert_eq!(service.provider, h.provider);
}

#[test]
fn update_validates_like_register() {
    let h = setup();

    let id = h
        .client
        .register_service(&h.provider, &name(&h.env, "API"), &1_000, &h.payout);

    assert_eq!(
        h.client
            .try_update_service(&id, &name(&h.env, ""), &2_000, &h.payout),
        Err(Ok(RegistryError::EmptyName))
    );
    assert_eq!(
        h.client
            .try_update_service(&id, &name(&h.env, "API"), &0, &h.payout),
        Err(Ok(RegistryError::InvalidPrice))
    );
}

#[test]
fn only_the_provider_can_update_or_deactivate() {
    let h = setup();
    let intruder = Address::generate(&h.env);

    let id = h
        .client
        .register_service(&h.provider, &name(&h.env, "API"), &1_000, &h.payout);

    // Fresh env auth mocking: only `intruder` signs, so the provider's
    // require_auth inside update/deactivate must fail.
    let update_result = h
        .client
        .mock_auths(&[MockAuth {
            address: &intruder,
            invoke: &MockAuthInvoke {
                contract: &h.contract_id,
                fn_name: "update_service",
                args: (id, name(&h.env, "Hijacked"), 1i128, intruder.clone()).into_val(&h.env),
                sub_invokes: &[],
            },
        }])
        .try_update_service(&id, &name(&h.env, "Hijacked"), &1, &intruder);

    assert!(update_result.is_err());
    assert_eq!(h.client.get_service(&id).name, name(&h.env, "API"));
}

#[test]
fn deactivate_hides_service_from_payments() {
    let h = setup();

    let id = h
        .client
        .register_service(&h.provider, &name(&h.env, "API"), &1_000, &h.payout);

    assert_eq!(h.client.get_active_service(&id).id, id);

    h.client.deactivate_service(&id);

    assert!(!h.client.get_service(&id).active);
    assert_eq!(
        h.client.try_get_active_service(&id),
        Err(Ok(RegistryError::ServiceInactive))
    );

    // Idempotent: deactivating again is a no-op, not an error.
    h.client.deactivate_service(&id);
}

#[test]
fn list_active_paginates_and_skips_inactive() {
    let h = setup();

    for label in ["a", "b", "c", "d", "e"] {
        h.client
            .register_service(&h.provider, &name(&h.env, label), &1_000, &h.payout);
    }

    // Deactivate id 1: active set is [0, 2, 3, 4].
    h.client.deactivate_service(&1);

    let page = h.client.list_active(&0, &2);
    assert_eq!(page.len(), 2);
    assert_eq!(page.get_unchecked(0).id, 0);
    assert_eq!(page.get_unchecked(1).id, 2);

    let page = h.client.list_active(&2, &10);
    assert_eq!(page.len(), 2);
    assert_eq!(page.get_unchecked(0).id, 3);
    assert_eq!(page.get_unchecked(1).id, 4);

    assert_eq!(h.client.list_active(&10, &10), vec![&h.env]);
    assert_eq!(
        h.client.try_list_active(&0, &51),
        Err(Ok(RegistryError::PageTooLarge))
    );
}

#[test]
fn lifecycle_emits_events() {
    let h = setup();

    let id = h
        .client
        .register_service(&h.provider, &name(&h.env, "API"), &1_000, &h.payout);

    let registered = ServiceRegistered {
        provider: h.provider.clone(),
        id,
        name: name(&h.env, "API"),
        price: 1_000,
    }
    .to_xdr(&h.env, &h.contract_id);

    let all = h.env.events().all();
    assert!(all.events().contains(&registered));

    h.client.deactivate_service(&id);

    let deactivated = ServiceDeactivated {
        provider: h.provider.clone(),
        id,
    }
    .to_xdr(&h.env, &h.contract_id);

    let all = h.env.events().all();
    assert!(all.events().contains(&deactivated));
}

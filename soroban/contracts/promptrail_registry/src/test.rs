use crate::{EndpointRegistered, PromptRailRegistry, PromptRailRegistryClient, RegistryError};

use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Events as _},
    Address, Env, Event as _, IntoVal, String,
};

fn setup() -> (Env, Address) {
    let env = Env::default();

    let contract_id = env.register(PromptRailRegistry, ());

    (env, contract_id)
}

#[test]
fn register_endpoint_successfully() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "Translation API");

    env.mock_all_auths();

    let endpoint = client.register(&owner, &name, &100_i128);

    assert_eq!(endpoint.owner, owner);

    assert_eq!(endpoint.name, name);

    assert_eq!(endpoint.price, 100_i128);

    assert!(endpoint.active);
}

#[test]
fn register_requires_owner_auth() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "Secure API");

    env.mock_all_auths();

    client.register(&owner, &name, &250_i128);

    /*
     * Security assertion:
     *
     * We do not merely mock auth.
     * We verify that register()
     * actually requested owner auth.
     */
    assert_eq!(
        env.auths(),
        [(
            owner.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract_id,
                    symbol_short!("register"),
                    (&owner, &name, 250_i128,).into_val(&env),
                )),

                sub_invocations: [].into(),
            }
        )]
    );
}

#[test]
fn register_without_auth_fails() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "No Auth API");

    /*
     * No mock_all_auths().
     *
     * require_auth() must cause
     * the invocation to fail.
     */
    let result = client.try_register(&owner, &name, &100_i128);

    assert!(result.is_err());
}

#[test]
fn rejects_duplicate_registration() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let first_name = String::from_str(&env, "First API");

    let second_name = String::from_str(&env, "Second API");

    env.mock_all_auths();

    client.register(&owner, &first_name, &100_i128);

    let result = client.try_register(&owner, &second_name, &200_i128);

    assert_eq!(result, Err(Ok(RegistryError::EndpointExists)));
}

#[test]
fn rejects_empty_name() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let empty_name = String::from_str(&env, "");

    env.mock_all_auths();

    let result = client.try_register(&owner, &empty_name, &100_i128);

    assert_eq!(result, Err(Ok(RegistryError::EmptyName)));
}

#[test]
fn rejects_oversized_name() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    /*
     * 81 characters.
     * Contract maximum is 80.
     */
    let oversized_name = String::from_str(
        &env,
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );

    env.mock_all_auths();

    let result = client.try_register(&owner, &oversized_name, &100_i128);

    assert_eq!(result, Err(Ok(RegistryError::NameTooLong)));
}

#[test]
fn rejects_zero_price() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "Zero Price API");

    env.mock_all_auths();

    let result = client.try_register(&owner, &name, &0_i128);

    assert_eq!(result, Err(Ok(RegistryError::InvalidPrice)));
}

#[test]
fn rejects_negative_price() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "Negative Price API");

    env.mock_all_auths();

    let result = client.try_register(&owner, &name, &(-1_i128));

    assert_eq!(result, Err(Ok(RegistryError::InvalidPrice)));
}

#[test]
fn rejects_price_above_limit() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "Expensive API");

    env.mock_all_auths();

    let result = client.try_register(&owner, &name, &1_000_000_000_001_i128);

    assert_eq!(result, Err(Ok(RegistryError::InvalidPrice)));
}

#[test]
fn get_returns_registered_endpoint() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "Readable API");

    env.mock_all_auths();

    client.register(&owner, &name, &500_i128);

    let endpoint = client.get(&owner);

    assert_eq!(endpoint.owner, owner);

    assert_eq!(endpoint.name, name);

    assert_eq!(endpoint.price, 500_i128);

    assert!(endpoint.active);
}

#[test]
fn missing_endpoint_returns_error() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let unknown_owner = Address::generate(&env);

    let result = client.try_get(&unknown_owner);

    assert_eq!(result, Err(Ok(RegistryError::EndpointNotFound)));
}

#[test]
fn owner_can_update_price() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "Priced API");

    env.mock_all_auths();

    client.register(&owner, &name, &100_i128);

    let updated = client.update_price(&owner, &300_i128);

    assert_eq!(updated.price, 300_i128);

    let stored = client.get(&owner);

    assert_eq!(stored.price, 300_i128);
}

#[test]
fn update_price_rejects_invalid_value() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "Protected Price API");

    env.mock_all_auths();

    client.register(&owner, &name, &100_i128);

    let result = client.try_update_price(&owner, &0_i128);

    assert_eq!(result, Err(Ok(RegistryError::InvalidPrice)));
}

#[test]
fn owner_can_disable_endpoint() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "Toggle API");

    env.mock_all_auths();

    client.register(&owner, &name, &100_i128);

    let endpoint = client.set_active(&owner, &false);

    assert!(!endpoint.active);

    let stored = client.get(&owner);

    assert!(!stored.active);
}

#[test]
fn registration_emits_expected_event() {
    let (env, contract_id) = setup();

    let client = PromptRailRegistryClient::new(&env, &contract_id);

    let owner = Address::generate(&env);

    let name = String::from_str(&env, "Event API");

    env.mock_all_auths();

    client.register(&owner, &name, &700_i128);

    let expected_event = EndpointRegistered {
        owner,
        name,
        price: 700_i128,
    }
    .to_xdr(&env, &contract_id);

    assert_eq!(env.events().all(), [expected_event]);
}

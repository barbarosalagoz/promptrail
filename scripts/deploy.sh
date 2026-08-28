#!/usr/bin/env bash
#
# Idempotent testnet deploy for the PromptRail Orange Belt contracts.
#
#   ./scripts/deploy.sh [identity]
#
# - Builds the wasm.
# - Deploys service-registry and payment-router, unless a contract alias from
#   a previous run already exists (making re-runs safe).
# - Initializes the router with the native XLM SAC and the registry address
#   (initialize is once-only on-chain; a re-run tolerates AlreadyInitialized).
# - Echoes both contract IDs, a ready-to-paste README block, and a .env block.
#
# Signing happens with a local stellar identity (default: "deployer");
# nothing here belongs in CI.

set -euo pipefail

IDENTITY="${1:-deployer}"
NETWORK="testnet"

say() { printf '\n\033[1;35m== %s\033[0m\n' "$*"; }

alias_id() {
  # Extract the contract id stored for an alias, if any. Depending on CLI
  # version and cwd, aliases land in the repo-local .stellar/ or in the
  # global config dir — check both.
  local name="$1" file id
  for file in ".stellar/contract-ids/$name.json" "$HOME/.config/stellar/contract-ids/$name.json"; do
    if [ -f "$file" ]; then
      # {"ids":{"Test SDF Network ; September 2015":"C..."}} — pure-shell
      # extraction, since path styles differ across platforms.
      id="$(grep -oE '"C[A-Z2-7]{55}"' "$file" | head -1 | tr -d '"')"
      if [ -n "$id" ]; then
        echo "$id"
        return 0
      fi
    fi
  done
  true
}

say "Toolchain"
stellar --version | head -1
rustc --version

say "Ensure identity '$IDENTITY' exists and is funded"
if ! stellar keys address "$IDENTITY" >/dev/null 2>&1; then
  stellar keys generate "$IDENTITY" --network "$NETWORK" --fund
fi
DEPLOYER_ADDRESS="$(stellar keys address "$IDENTITY")"
echo "deployer: $DEPLOYER_ADDRESS"

say "Build contracts"
stellar contract build

say "Resolve native XLM Stellar Asset Contract"
TOKEN_ID="$(stellar contract id asset --asset native --network "$NETWORK")"
echo "native SAC: $TOKEN_ID"

say "Deploy service-registry (skipped if alias exists)"
REGISTRY_ID="$(alias_id service-registry)"
if [ -z "$REGISTRY_ID" ]; then
  REGISTRY_ID="$(stellar contract deploy \
    --wasm target/wasm32v1-none/release/service_registry.wasm \
    --source "$IDENTITY" --network "$NETWORK" --alias service-registry \
    | tail -1)"
fi
echo "service-registry: $REGISTRY_ID"

say "Deploy payment-router (skipped if alias exists)"
ROUTER_ID="$(alias_id payment-router)"
if [ -z "$ROUTER_ID" ]; then
  ROUTER_ID="$(stellar contract deploy \
    --wasm target/wasm32v1-none/release/payment_router.wasm \
    --source "$IDENTITY" --network "$NETWORK" --alias payment-router \
    | tail -1)"
fi
echo "payment-router: $ROUTER_ID"

say "Initialize payment-router (token + registry)"
if stellar contract invoke --id "$ROUTER_ID" --source "$IDENTITY" --network "$NETWORK" \
  -- initialize --token "$TOKEN_ID" --registry_address "$REGISTRY_ID" 2>/dev/null; then
  echo "initialized."
else
  echo "already initialized — leaving as-is."
fi

say "Verify live configuration"
echo "router.get_registry -> $(stellar contract invoke --id "$ROUTER_ID" --source "$IDENTITY" --network "$NETWORK" -- get_registry 2>/dev/null)"
echo "router.get_token    -> $(stellar contract invoke --id "$ROUTER_ID" --source "$IDENTITY" --network "$NETWORK" -- get_token 2>/dev/null)"

say "Ready-to-paste README block"
cat <<BLOCK
| Contract | Testnet ID |
| --- | --- |
| service-registry | \`$REGISTRY_ID\` |
| payment-router | \`$ROUTER_ID\` |
| Settlement token (native XLM SAC) | \`$TOKEN_ID\` |

Explorer:
- https://stellar.expert/explorer/testnet/contract/$REGISTRY_ID
- https://stellar.expert/explorer/testnet/contract/$ROUTER_ID
BLOCK

say "Frontend .env block"
cat <<BLOCK
VITE_REGISTRY_ID=$REGISTRY_ID
VITE_ROUTER_ID=$ROUTER_ID
BLOCK

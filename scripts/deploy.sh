#!/usr/bin/env bash
# FridayChain Arena — Deploy Script
# Deploys the WASM smart contracts to the Linera network.
#
# Usage:
#   ./scripts/deploy.sh <HUB_CHAIN_ID>
#
# Requires:
#   - linera CLI installed and configured
#   - Wallet with a chain claimed
#   - Built WASM artifacts (run ./scripts/build.sh first)

set -euo pipefail

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <HUB_CHAIN_ID>"
    echo ""
    echo "Example:"
    echo "  $0 e476187f6ddfeb9d588c7b45d3df334d5501d6499b3f9ad5595cae86cce16a65"
    exit 1
fi

HUB_CHAIN_ID="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_DIR="$ROOT_DIR/target/wasm32-unknown-unknown/release"

CONTRACT_WASM="$WASM_DIR/fridaychain_arena_contract.wasm"
SERVICE_WASM="$WASM_DIR/fridaychain_arena_service.wasm"

echo "╔══════════════════════════════════════════╗"
echo "║   FridayChain Arena — Contract Deploy    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Hub Chain ID: $HUB_CHAIN_ID"
echo ""

# Verify files exist
if [ ! -f "$CONTRACT_WASM" ] || [ ! -f "$SERVICE_WASM" ]; then
    echo "ERROR: WASM artifacts not found. Run ./scripts/build.sh first."
    exit 1
fi

echo "→ Publishing and creating application..."
linera publish-and-create \
    "$CONTRACT_WASM" \
    "$SERVICE_WASM" \
    --json-parameters "{\"hub_chain_id\":\"$HUB_CHAIN_ID\"}" \
    --json-argument "{\"hub_chain_id\":\"$HUB_CHAIN_ID\"}"

echo ""
echo "✓ Deployment complete!"
echo ""
echo "Save the Application ID printed above."
echo ""
echo "Next steps:"
echo "  1. Set VITE_APP_ID in frontend/.env"
echo "  2. Start a tournament:"
echo "     ./scripts/tournament.sh start <SEED> <DURATION_SECS>"

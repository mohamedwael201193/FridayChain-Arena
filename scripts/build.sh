#!/usr/bin/env bash
# FridayChain Arena — Build Script
# Builds the WASM smart contracts for deployment to Linera.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"

echo "╔══════════════════════════════════════════╗"
echo "║    FridayChain Arena — Contract Build    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check toolchain
echo "→ Checking Rust toolchain..."
rustc --version
cargo --version

# Check wasm target
if ! rustup target list --installed | grep -q wasm32-unknown-unknown; then
    echo "→ Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

# Build contracts
echo ""
echo "→ Building contracts for wasm32-unknown-unknown..."
cd "$ROOT_DIR"
cargo build --release --target wasm32-unknown-unknown -p fridaychain-arena

echo ""
echo "→ Build artifacts:"
WASM_DIR="$ROOT_DIR/target/wasm32-unknown-unknown/release"
ls -lh "$WASM_DIR/fridaychain_arena_contract.wasm" 2>/dev/null || echo "  Contract WASM not found"
ls -lh "$WASM_DIR/fridaychain_arena_service.wasm" 2>/dev/null || echo "  Service WASM not found"

echo ""
echo "✓ Build complete!"
echo ""
echo "To deploy:"
echo "  ./scripts/deploy.sh <HUB_CHAIN_ID>"

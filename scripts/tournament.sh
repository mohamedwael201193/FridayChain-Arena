#!/usr/bin/env bash
# FridayChain Arena — Tournament Control Script
# Admin CLI for managing tournament lifecycle.
#
# Usage:
#   ./scripts/tournament.sh start <SEED> [DURATION_SECS]
#   ./scripts/tournament.sh end
#   ./scripts/tournament.sh status
#   ./scripts/tournament.sh leaderboard [LIMIT]
#
# Environment variables (set in .env or export):
#   ARENA_CHAIN_ID    — The Hub chain ID
#   ARENA_APP_ID      — The application ID

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env if it exists
if [ -f "$SCRIPT_DIR/../.env" ]; then
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/../.env"
fi

CHAIN_ID="${ARENA_CHAIN_ID:-}"
APP_ID="${ARENA_APP_ID:-}"

if [ -z "$CHAIN_ID" ] || [ -z "$APP_ID" ]; then
    echo "ERROR: ARENA_CHAIN_ID and ARENA_APP_ID must be set."
    echo ""
    echo "Either export them or create a .env file:"
    echo "  ARENA_CHAIN_ID=<your-hub-chain-id>"
    echo "  ARENA_APP_ID=<your-application-id>"
    exit 1
fi

COMMAND="${1:-help}"

case "$COMMAND" in
    start)
        SEED="${2:?Usage: tournament.sh start <SEED> [DURATION_SECS]}"
        DURATION="${3:-3600}"

        echo "╔══════════════════════════════════════════╗"
        echo "║     Starting Tournament                  ║"
        echo "╠══════════════════════════════════════════╣"
        echo "║  Seed:     $SEED"
        echo "║  Duration: ${DURATION}s ($(echo "$DURATION / 60" | bc)m)"
        echo "╚══════════════════════════════════════════╝"
        echo ""

        linera service --port 8080 &
        SERVICE_PID=$!
        sleep 2

        curl -s "http://localhost:8080/chains/$CHAIN_ID/applications/$APP_ID" \
            -H 'Content-Type: application/json' \
            -d "{
                \"query\": \"mutation { startTournament(seed: $SEED, durationSecs: $DURATION) }\"
            }" | python3 -m json.tool 2>/dev/null || cat

        kill $SERVICE_PID 2>/dev/null || true

        echo ""
        echo "✓ Tournament started!"
        echo "  Players can now join at the frontend."
        ;;

    end)
        echo "╔══════════════════════════════════════════╗"
        echo "║     Ending Tournament                    ║"
        echo "╚══════════════════════════════════════════╝"
        echo ""

        linera service --port 8080 &
        SERVICE_PID=$!
        sleep 2

        curl -s "http://localhost:8080/chains/$CHAIN_ID/applications/$APP_ID" \
            -H 'Content-Type: application/json' \
            -d '{
                "query": "mutation { endTournament }"
            }' | python3 -m json.tool 2>/dev/null || cat

        kill $SERVICE_PID 2>/dev/null || true

        echo ""
        echo "✓ Tournament ended! Final rankings computed on-chain."
        ;;

    status)
        echo "→ Querying tournament status..."

        linera service --port 8080 &
        SERVICE_PID=$!
        sleep 2

        curl -s "http://localhost:8080/chains/$CHAIN_ID/applications/$APP_ID" \
            -H 'Content-Type: application/json' \
            -d '{
                "query": "{ activeTournament { id seed startTimeMicros endTimeMicros active totalPlayers totalCompletions } tournamentStats { tournamentId totalPlayers totalCompletions averageScore bestScore isActive } }"
            }' | python3 -m json.tool 2>/dev/null || cat

        kill $SERVICE_PID 2>/dev/null || true
        ;;

    leaderboard)
        LIMIT="${2:-50}"
        echo "→ Querying leaderboard (top $LIMIT)..."

        linera service --port 8080 &
        SERVICE_PID=$!
        sleep 2

        curl -s "http://localhost:8080/chains/$CHAIN_ID/applications/$APP_ID" \
            -H 'Content-Type: application/json' \
            -d "{
                \"query\": \"{ leaderboard(limit: $LIMIT) { wallet discordUsername score completionTimeMicros penaltyCount moveCount completed } }\"
            }" | python3 -m json.tool 2>/dev/null || cat

        kill $SERVICE_PID 2>/dev/null || true
        ;;

    help|*)
        echo "FridayChain Arena — Tournament Control CLI"
        echo ""
        echo "Usage:"
        echo "  ./scripts/tournament.sh start <SEED> [DURATION_SECS]   Start a new tournament"
        echo "  ./scripts/tournament.sh end                            End the current tournament"
        echo "  ./scripts/tournament.sh status                         Check tournament status"
        echo "  ./scripts/tournament.sh leaderboard [LIMIT]            View leaderboard"
        echo ""
        echo "Environment:"
        echo "  ARENA_CHAIN_ID    Hub chain ID (required)"
        echo "  ARENA_APP_ID      Application ID (required)"
        echo ""
        echo "Examples:"
        echo "  ./scripts/tournament.sh start 20260213 3600   # Friday Feb 13, 1 hour"
        echo "  ./scripts/tournament.sh end"
        echo "  ./scripts/tournament.sh leaderboard 20"
        ;;
esac

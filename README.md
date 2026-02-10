# FridayChain Arena

**Fully on-chain competitive Sudoku tournament system built on Linera microchains.**

Every move is a blockchain transaction. Every score is computed by smart contracts. Every game is replayable and verifiable. Cheating is cryptographically impossible.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FridayChain Arena                           │
├──────────────────────┬──────────────────────────────────────────────┤
│   Frontend (React)   │         Linera Network                      │
│                      │                                              │
│  MetaMask Signer ────┼──→ Player Chain A (own microchain)          │
│  @linera/client WASM │      ├─ Local game state                    │
│  GraphQL queries     │      ├─ Move validation                     │
│  Event polling       │      └─ Cross-chain messages to Hub         │
│                      │                                              │
│                      │   Player Chain B (own microchain)            │
│                      │      └─ Same pattern                        │
│                      │                                              │
│                      │   Hub Chain (admin-controlled)               │
│                      │      ├─ Global player registry              │
│                      │      ├─ Tournament lifecycle                │
│                      │      ├─ Leaderboard aggregation             │
│                      │      ├─ Event stream broadcasting           │
│                      │      └─ Score computation                   │
└──────────────────────┴──────────────────────────────────────────────┘
```

### Key Design Decisions

- **Single WASM contract** — same bytecode runs on Hub and player chains, with role-based logic determined by comparing `runtime.chain_id()` with `hub_chain_id`
- **No backend server** — frontend uses the embedded `@linera/client` WASM module to talk directly to chains via GraphQL
- **Deterministic Sudoku** — puzzles generated from `ChaCha8Rng` seeded with a `u64`; identical seed = identical puzzle on every chain
- **Event-driven architecture** — Hub emits events on a `"tournament"` stream; player chains subscribe via `subscribe_to_events`
- **Cross-chain leaderboard** — players send `LeaderboardRequest` messages to Hub; Hub responds with sorted entries

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Smart Contracts | Rust / WASM | 1.86.0 |
| Blockchain | Linera SDK | 0.15.8 |
| GraphQL | async-graphql | 7.0.17 |
| Frontend | React + TypeScript | 18.x |
| Build Tool | Vite | 5.x |
| Styling | Tailwind CSS | 3.x |
| Wallet | MetaMask | - |
| PRNG | ChaCha8Rng | - |

---

## Project Structure

```
FridayChain-Arena/
├── Cargo.toml                          # Workspace root
├── rust-toolchain.toml                 # Pin Rust 1.86.0
├── contracts/fridaychain-arena/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                      # ABI + all shared types
│       ├── state.rs                    # On-chain state (Linera Views)
│       ├── contract.rs                 # Contract logic (all operations)
│       ├── service.rs                  # GraphQL query/mutation service
│       └── sudoku.rs                   # Deterministic puzzle generator
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── lib/
│       │   ├── linera/lineraClient.ts  # Linera WASM client singleton
│       │   ├── metamask/metamaskSigner.ts
│       │   └── arena/
│       │       ├── arenaApi.ts         # High-level API
│       │       ├── queries.ts          # GraphQL strings
│       │       └── types.ts            # TypeScript types
│       ├── hooks/
│       │   ├── useArena.tsx            # Main state context
│       │   ├── useLeaderboard.ts
│       │   └── useTournament.ts
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── Navbar.tsx
│       │   ├── SudokuGrid.tsx
│       │   ├── LeaderboardTable.tsx
│       │   ├── CountdownTimer.tsx
│       │   ├── HowToPlay.tsx
│       │   └── AudioPlayer.tsx
│       └── pages/
│           ├── HomePage.tsx
│           ├── GamePlayPage.tsx
│           ├── LeaderboardPage.tsx
│           └── ProfilePage.tsx
└── scripts/
    ├── build.sh                        # Build WASM contracts
    ├── deploy.sh                       # Deploy to Linera network
    └── tournament.sh                   # Admin CLI for tournaments
```

---

## Smart Contract Architecture

### Operations (User Actions)

| Operation | Who | Description |
|-----------|-----|-------------|
| `RegisterPlayer` | Any user | Register Discord username on-chain |
| `UpdateUsername` | Registered user | Change Discord username |
| `PlaceCell` | Registered user | Place a number in a Sudoku cell |
| `ClearCell` | Registered user | Clear a previously placed cell |
| `SubscribeToHub` | Any user | Subscribe to Hub's event stream |
| `RequestLeaderboard` | Any user | Request leaderboard from Hub |
| `StartTournament` | Admin only | Start a new tournament with seed |
| `EndTournament` | Admin only | End tournament, finalize rankings |

### Cross-Chain Messages

| Message | Direction | Purpose |
|---------|-----------|---------|
| `SyncPlayer` | Player → Hub | Register player globally |
| `SyncCellPlacement` | Player → Hub | Record move for auditing |
| `SyncBoardComplete` | Player → Hub | Record board completion |
| `LeaderboardRequest` | Player → Hub | Request leaderboard data |
| `LeaderboardResponse` | Hub → Player | Return sorted leaderboard |
| `TournamentStarted` | Hub → All (event) | Broadcast tournament start |
| `TournamentEnded` | Hub → All (event) | Broadcast final rankings |

### Scoring Formula

```
score = 10,000 - (completion_time_seconds × 10) - (penalty_count × 200)
```

- Maximum possible score: 10,000 (instant solve, zero penalties)
- Each invalid placement: -200 points
- Each second of solving time: -10 points
- Incomplete boards score 0

---

## Getting Started

### Prerequisites

- Rust 1.86.0 with `wasm32-unknown-unknown` target
- Linera CLI (install from source or binary)
- Node.js 18+ and npm
- MetaMask browser extension

### 1. Build Contracts

```bash
./scripts/build.sh
```

### 2. Start Local Linera Network (Development)

```bash
linera net up
```

### 3. Deploy Contracts

```bash
# Get your chain ID
linera wallet show

# Deploy (HUB_CHAIN_ID is typically your default chain)
./scripts/deploy.sh <HUB_CHAIN_ID>
```

Save the Application ID that's printed.

### 4. Configure Frontend

```bash
cd frontend
cp .env.example .env
# Edit .env and set VITE_APP_ID=<your-application-id>
```

### 5. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in a browser with MetaMask installed.

---

## Admin CLI — Tournament Lifecycle

Tournaments are controlled **exclusively via CLI** by the admin. No frontend buttons.

### Start a Tournament

```bash
# Friday tournament with 1-hour duration
./scripts/tournament.sh start 20260213 3600
```

The `seed` (20260213) determines the puzzle. Same seed = same puzzle.

### Check Status

```bash
./scripts/tournament.sh status
```

### View Leaderboard

```bash
./scripts/tournament.sh leaderboard 50
```

### End Tournament

```bash
./scripts/tournament.sh end
```

### Alternative: Direct CLI

```bash
# Start tournament directly
linera service --port 8080 &
curl http://localhost:8080/chains/<CHAIN_ID>/applications/<APP_ID> \
  -H 'Content-Type: application/json' \
  -d '{"query": "mutation { startTournament(seed: 20260213, durationSecs: 3600) }"}'
```

---

## Data Flow: Tournament Lifecycle

```
1. ADMIN runs: ./scripts/tournament.sh start 20260213 3600
   ↓
2. Hub chain: StartTournament operation executes
   - Generates puzzle from seed 20260213
   - Emits TournamentStarted event on "tournament" stream
   ↓
3. Player chains: Receive TournamentStarted via subscription
   - Generate identical puzzle locally from same seed
   - Players can now see the puzzle in frontend
   ↓
4. PLAYER clicks cell (3, 5) → selects value 7
   - Frontend calls: mutation { placeCell(row: 3, col: 5, value: 7) }
   - Player chain validates Sudoku rules
   - If valid: places cell, sends SyncCellPlacement to Hub
   - If invalid: records penalty, still places cell
   ↓
5. PLAYER completes the board
   - Player chain detects all 81 cells match solution
   - Computes score: 10000 - (time×10) - (penalties×200)
   - Sends SyncBoardComplete to Hub with score
   ↓
6. Hub receives SyncBoardComplete
   - Updates leaderboard entry
   - Emits LeaderboardUpdated event
   ↓
7. ADMIN runs: ./scripts/tournament.sh end
   - Hub marks tournament inactive
   - Emits TournamentEnded with final rankings
   - Archives tournament to past_tournaments log
```

---

## Anti-Cheat Guarantees

| Threat | Mitigation |
|--------|-----------|
| Fake scores | Scores computed on-chain from validated moves |
| Playing outside time window | Contract checks `system_time()` vs tournament window |
| Modified puzzle | Puzzle deterministically generated from on-chain seed |
| Seeing solution | Solution never exposed via GraphQL service |
| Impersonation | Every op authenticated via `runtime.authenticated_signer()` |
| Replay attacks | Operations are per-block, per-chain, per-signer |
| Time manipulation | `runtime.system_time()` is chain-consensus time |

---

## Scalability

- **Microchain parallelism**: Each player operates their own chain — no contention
- **Hub load**: Only receives sync messages (not every UI interaction)
- **Leaderboard caching**: Players cache leaderboard locally via cross-chain request
- **Event streams**: Linera's native pub/sub — Hub emits once, all subscribers receive
- **No single bottleneck**: Validator network processes chains in parallel
- **Supports thousands of concurrent players** without degradation

---

## Event-Driven Architecture

The frontend reconstructs ALL state from on-chain queries. The data flow:

1. **Frontend polls** its own player chain every 3 seconds
2. **Player chain** has local state (game board, tournament info from event subscription)
3. **Leaderboard** is fetched on-demand via cross-chain `LeaderboardRequest` → `LeaderboardResponse`
4. **Block notifications** (`client.onNotification`) trigger immediate re-queries
5. **No database, no WebSocket, no backend** — chain is the only source of truth

---

## License

MIT

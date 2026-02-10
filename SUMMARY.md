# FridayChain Arena — Complete Technical Summary

> **Fully On-Chain Competitive Sudoku Tournament System Built on Linera Microchains**

---

## Table of Contents

1. [What Is FridayChain Arena?](#1-what-is-fridaychain-arena)
2. [Architecture Overview](#2-architecture-overview)
3. [How Linera Microchains Work](#3-how-linera-microchains-work)
4. [Smart Contract Deep Dive](#4-smart-contract-deep-dive)
5. [Sudoku Engine — Deterministic & Cheat-Proof](#5-sudoku-engine--deterministic--cheat-proof)
6. [Scoring & Ranking System](#6-scoring--ranking-system)
7. [Cross-Chain Communication](#7-cross-chain-communication)
8. [Frontend Architecture](#8-frontend-architecture)
9. [How the Game Works End-to-End](#9-how-the-game-works-end-to-end)
10. [Tournament Lifecycle (CLI Commands)](#10-tournament-lifecycle-cli-commands)
11. [Why This Game Cannot Be Cheated](#11-why-this-game-cannot-be-cheated)
12. [Tech Stack](#12-tech-stack)
13. [Deployment Details](#13-deployment-details)
14. [File Structure](#14-file-structure)

---

## 1. What Is FridayChain Arena?

FridayChain Arena is a **fully on-chain competitive Sudoku tournament system** where:

- Every player gets their own **Linera microchain** (personal blockchain)
- Every move is an **on-chain transaction** — nothing is stored off-chain
- The Sudoku puzzle is **deterministically generated** from a seed — same seed = same puzzle for all players
- The solution is **never exposed** to players — it's locked inside the WASM contract
- Scores are **computed by the smart contract** — no client can fake a score
- A live **leaderboard** shows all players competing in real-time
- Results are **verifiable and auditable** — anyone can replay a game from the on-chain move log

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CONWAY TESTNET                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    HUB CHAIN (Admin)                         │   │
│  │  - Tournament state (start/end times, seed, status)          │   │
│  │  - Global player registry                                    │   │
│  │  - Leaderboard (all player scores)                           │   │
│  │  - Puzzle solution (hidden, never exposed via GraphQL)       │   │
│  │  - Event stream (TournamentStarted, TournamentEnded, etc.)   │   │
│  └──────────┬───────────────────┬───────────────────┬───────────┘   │
│             │  Events/Messages  │                   │               │
│     ┌───────▼───────┐   ┌──────▼────────┐   ┌──────▼────────┐     │
│     │ Player Chain  │   │ Player Chain  │   │ Player Chain  │     │
│     │   (devmo)     │   │    (bob)      │   │   (alice)     │     │
│     │               │   │               │   │               │     │
│     │ - Local game  │   │ - Local game  │   │ - Local game  │     │
│     │   state       │   │   state       │   │   state       │     │
│     │ - Board +     │   │ - Board +     │   │ - Board +     │     │
│     │   moves       │   │   moves       │   │   moves       │     │
│     │ - Penalty     │   │ - Penalty     │   │ - Penalty     │     │
│     │   tracking    │   │   tracking    │   │   tracking    │     │
│     └───────────────┘   └───────────────┘   └───────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      BROWSER (per player)                           │
│                                                                     │
│  ┌───────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │
│  │   MetaMask     │  │  @linera/client  │  │  React + Vite +     │  │
│  │   (Identity)   │  │  (WASM module)   │  │  Tailwind CSS       │  │
│  │               │  │                  │  │                     │  │
│  │  EVM address  │  │  PrivateKey      │  │  Sudoku grid        │  │
│  │  = display ID │  │  signer          │  │  Game stats         │  │
│  │               │  │  = on-chain ID   │  │  Live leaderboard   │  │
│  │               │  │                  │  │  Score estimate      │  │
│  └───────────────┘  └──────────────────┘  └─────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Two-chain model:**
- **Hub Chain** — Single chain managed by the admin. Holds tournament config, global leaderboard, puzzle solution, and broadcasts events to all player chains.
- **Player Chains** — Each player gets their own microchain via the faucet. Their game state (board, moves, penalties) lives on their personal chain. Mutations (PlaceCell, RegisterPlayer) happen on the player's chain and sync results to the Hub.

---

## 3. How Linera Microchains Work

Linera is a **multi-chain protocol** where every user gets their own blockchain (microchain). This is fundamentally different from Ethereum where all users share one chain.

### Key Concepts Used in FridayChain Arena:

| Concept | How FridayChain Uses It |
|---------|------------------------|
| **Microchain** | Each player gets a personal chain via the Conway testnet faucet |
| **Application** | The same WASM app binary is deployed once and runs on ALL chains |
| **Parameters** | `hub_chain_id` — tells every chain instance where the Hub is |
| **Cross-chain Messages** | Player → Hub sync (SyncPlayer, SyncCellPlacement, SyncBoardComplete) |
| **Event Streams** | Hub emits TournamentStarted/Ended events, player chains subscribe |
| **`process_streams()`** | Player chains listen for Hub events and update local state |
| **Contract + Service** | Contract = write logic (WASM binary), Service = read logic + GraphQL |
| **Views** | Persistent key-value storage (`MapView`, `RegisterView`, `LogView`) |
| **BFT Consensus** | Validators confirm blocks; only needs a majority to function |

### The WASM Client (`@linera/client`)

The browser runs a **full Linera WASM client** — no backend server required. The WASM module:
1. Creates a wallet from the faucet genesis config
2. Claims a microchain for the player
3. Signs and proposes blocks directly from the browser
4. Queries chain state via GraphQL

**Important:** Both queries AND mutations go through `app.query()`. The service's `MutationRoot` calls `schedule_operation()` internally, and the WASM client auto-proposes a block containing those operations.

---

## 4. Smart Contract Deep Dive

### Files

| File | Purpose | Lines |
|------|---------|-------|
| `contracts/fridaychain-arena/src/lib.rs` | ABI definitions, shared types, enums | ~476 |
| `contracts/fridaychain-arena/src/contract.rs` | Contract logic (standalone WASM binary) | ~720 |
| `contracts/fridaychain-arena/src/service.rs` | GraphQL service (standalone WASM binary) | ~159 |
| `contracts/fridaychain-arena/src/state.rs` | `ArenaState` with Linera Views | ~187 |
| `contracts/fridaychain-arena/src/sudoku.rs` | Deterministic Sudoku engine | ~359 |

### Operations (User-Facing Mutations)

```rust
pub enum Operation {
    // Player Identity
    RegisterPlayer { discord_username: String },
    UpdateUsername { new_discord_username: String },

    // Gameplay
    PlaceCell { row: u8, col: u8, value: u8 },
    ClearCell { row: u8, col: u8 },

    // Cross-chain
    SubscribeToHub,
    RequestLeaderboard { limit: Option<u32> },

    // Admin (Hub chain only)
    StartTournament { seed: u64, duration_secs: u64 },
    EndTournament,
}
```

### Messages (Cross-Chain)

```rust
pub enum Message {
    // Player chain → Hub
    SyncPlayer(PlayerInfo),
    SyncCellPlacement { wallet, row, col, value, timestamp_micros, penalty_count },
    SyncBoardComplete { wallet, completion_time_micros, penalty_count, move_count },

    // Leaderboard request/response
    LeaderboardRequest { requester_chain, limit },
    LeaderboardResponse { entries, tournament_id, is_active },

    // Hub → Player (via event stream)
    TournamentStarted { tournament_id, seed, start_time_micros, end_time_micros },
    TournamentEnded { tournament_id, final_rankings },
}
```

### Events (Emitted on Hub's Stream)

```rust
pub enum ArenaEvent {
    TournamentStarted { tournament_id, seed, start_time_micros, end_time_micros },
    TournamentEnded { tournament_id, final_rankings },
    PlayerRegistered { wallet, discord_username },
    LeaderboardUpdated { entries },
}
```

### On-Chain State (`ArenaState`)

```rust
pub struct ArenaState {
    // Config
    pub hub_chain_id: RegisterView<Option<ChainId>>,
    pub admin_owner: RegisterView<Option<AccountOwner>>,

    // Player Registry
    pub players: MapView<AccountOwner, PlayerInfo>,
    pub player_count: RegisterView<u64>,

    // Tournament
    pub active_tournament: RegisterView<Option<Tournament>>,
    pub tournament_counter: RegisterView<u64>,
    pub current_puzzle: RegisterView<Option<SudokuBoard>>,  // SOLUTION IS HERE, NEVER EXPOSED

    // Per-Player Game State
    pub player_games: MapView<AccountOwner, PlayerGameState>,

    // Leaderboard (Hub only)
    pub leaderboard: MapView<AccountOwner, LeaderboardEntry>,
    pub leaderboard_log: LogView<LeaderboardEntry>,         // Audit trail

    // Events (Hub only)
    pub event_log: LogView<ArenaEvent>,
    pub event_counter: RegisterView<u64>,

    // Cached Leaderboard (Player chains)
    pub cached_leaderboard: RegisterView<Option<CachedLeaderboard>>,

    // Historical
    pub past_tournaments: LogView<Tournament>,
}
```

### PlaceCell — The Core Game Logic

When a player places a number in a cell, the contract:

1. **Authenticates** — Gets the signer's `AccountOwner` from `runtime.authenticated_signer()`
2. **Validates registration** — Checks the player exists in the `players` MapView
3. **Checks tournament** — Verifies a tournament is active and within the time window
4. **Validates input** — `row: 0-8`, `col: 0-8`, `value: 1-9`
5. **Loads puzzle** — Gets the current `SudokuBoard` (which contains both puzzle AND solution)
6. **Loads/creates game state** — Gets or initializes the player's `PlayerGameState`
7. **Checks given mask** — Rejects if the cell is a pre-filled "given" cell
8. **Validates Sudoku rules** — Calls `sudoku::validate_placement()` checking row, column, and 3×3 box
9. **Records penalty** — If placement violates Sudoku rules, `penalty_count += 1`
10. **Places the value** — `board[row][col] = value` (placed regardless of validity)
11. **Checks completion** — Compares full board against the solution
12. **If complete** — Calculates score from elapsed time and penalties, sends `SyncBoardComplete` to Hub
13. **Syncs to Hub** — Sends `SyncCellPlacement` cross-chain message (includes `penalty_count` for live score estimates)
14. **Hub updates leaderboard** — On receiving `SyncCellPlacement`, Hub computes an estimated live score and stores it
15. **Saves state** — Writes updated `PlayerGameState` to the MapView

---

## 5. Sudoku Engine — Deterministic & Cheat-Proof

### How Puzzles Are Generated

The engine uses **ChaCha8Rng** (a cryptographically-derived PRNG) seeded with a `u64` value:

```rust
pub fn generate_puzzle(seed: u64) -> Option<SudokuBoard> {
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    // 1. Generate complete valid 9×9 grid via backtracking with shuffled candidates
    // 2. Remove 46 cells (symmetrically) to create the puzzle
    // Result: { puzzle: [[u8; 9]; 9], solution: [[u8; 9]; 9] }
}
```

**Key properties:**
- **Deterministic** — Same seed ALWAYS produces the exact same puzzle on any machine, any chain, any WASM runtime
- **46 cells removed** — ~35 givens remain, creating a challenging tournament-difficulty puzzle
- **Diagonal symmetry** — Cells are removed in symmetric pairs for visual appeal
- **Backtracking algorithm** — Guarantees a valid, solvable Sudoku grid every time

### How Moves Are Validated

```rust
pub fn validate_placement(board: &[Vec<u8>], row: usize, col: usize, value: u8) -> bool {
    // 1. Check no duplicate in the same ROW
    // 2. Check no duplicate in the same COLUMN
    // 3. Check no duplicate in the same 3×3 BOX
    // Returns false if ANY rule is violated
}
```

This is **real Sudoku validation** — not a simple "does it match the solution" check. A move can be valid according to Sudoku rules but still be wrong (leading the player down a wrong path), or invalid (immediately flagged as a penalty).

### Game Replay Verification

Anyone can verify a completed game:

```rust
pub fn verify_game(seed: u64, moves: &[(u8, u8, u8)]) -> VerifyResult {
    // 1. Regenerate the puzzle from the seed
    // 2. Replay every move in order
    // 3. Count penalties for invalid placements
    // 4. Check if the final board matches the solution
    // 5. Return: { valid, total_moves, penalty_count, final_score, board_complete }
}
```

This is exposed via the GraphQL service as `verifyGame(seed, moves)` — meaning anyone can audit any game.

---

## 6. Scoring & Arena Rating System

### On-Chain Base Score Formula

The **smart contract** computes a base score when a player completes the puzzle:

```
Base Score = 10,000 - (elapsed_seconds × 2) - (penalties × 100)
Minimum score = 0
```

| Component | Value | Example |
|-----------|-------|---------|
| **Base score** | 10,000 points | — |
| **Time penalty** | -2 points per second | 10 minutes = -1,200 pts |
| **Move penalty** | -100 points per invalid placement | 3 penalties = -300 pts |

**Example:** Player finishes in 12 minutes with 2 penalties:
- `10,000 - (720 × 2) - (2 × 100) = 10,000 - 1,440 - 200 = 8,360 points`

### Arena Rating — Fair Live Ranking

The raw base score creates an **unfair ranking problem** for in-progress players: a player who placed 1 cell and stopped would rank above a player who is actively solving (because both lose the same time penalty, but the active player may have penalties from incorrect guesses).

To solve this, the frontend computes an **Arena Rating** that rewards progress:

```
Arena Rating = Base Score + (correct_cells × 150)
correct_cells = total_moves - penalties
```

| Component | Value | Example |
|-----------|-------|---------|
| **Base score** | 10,000 - time - penalties | 7,674 pts at ~19 min with 1 penalty |
| **Progress bonus** | +150 per correct cell placed | 3 correct cells = +450 pts |
| **Arena Rating** | Base + progress bonus | 7,674 + 450 = **8,124** |

**Real example from a live tournament:**
- **devmo**: 4 moves, 1 penalty → 3 correct cells → Base 7,674 + (3 × 150) = **8,124 Arena Rating** → Rank #1
- **bob**: 1 move, 0 penalties → 1 correct cell → Base 7,774 + (1 × 150) = **7,924 Arena Rating** → Rank #2

This rewards **active players** who make correct progress, preventing idle players from ranking above engaged ones.

**Important:** The progress bonus is a **frontend display enhancement only**. Final scores for completed players are always the on-chain base score computed by the contract. The progress bonus only affects ranking/display for in-progress players during an active tournament.

### Score Computation Locations

| What | Where | When |
|------|-------|------|
| **Final score** | Hub chain contract | `SyncBoardComplete` message arrives |
| **Estimated score** | Hub chain contract | Each `SyncCellPlacement` (includes `penalty_count`) |
| **Arena Rating** | Frontend (client-side) | Every 2 seconds via tick-based re-render |

```rust
// On-chain: Hub computes base score on SyncBoardComplete
let elapsed_secs = completion_time_micros.saturating_sub(tournament.start_time_micros) / 1_000_000;
let time_penalty = elapsed_secs.saturating_mul(2);
let move_pen = (penalty_count as u64).saturating_mul(100);
let score = 10_000u64.saturating_sub(time_penalty).saturating_sub(move_pen);
```

```typescript
// Frontend: Arena Rating computation
function computeArenaRating(entry, tournamentStartMicros) {
  const baseScore = computeLiveBaseScore(entry, tournamentStartMicros);
  if (entry.completed) return baseScore; // Final on-chain score
  const correctMoves = Math.max(0, entry.moveCount - entry.penaltyCount);
  return baseScore + (correctMoves * 150); // +150 per correct cell
}
```

### Leaderboard Ranking

The leaderboard sorts players by **Arena Rating**:

1. **Completed players first** (sorted by final on-chain score descending, then completion time ascending)
2. **In-progress players second** (sorted by Arena Rating descending)

```typescript
// Frontend sorting with Arena Rating
entries.sort((a, b) => {
  if (a.completed && !b.completed) return -1;  // Completed always ranks higher
  if (!a.completed && b.completed) return 1;
  return b.arenaRating - a.arenaRating;         // Higher rating = higher rank
});
```

### Live Leaderboard Features

- **Live ticking scores** — Arena Ratings update every 2 seconds without page refresh
- **Silent refresh** — Leaderboard data polls the Hub chain every 5 seconds without showing a spinner
- **Progress bar** — Shows X/46 cells solved with a visual progress bar
- **Progress bonus breakdown** — Shows "+450 progress" in green below the rating for in-progress players
- **Ranking stability** — Completed players always rank above in-progress players

---

## 7. Cross-Chain Communication

### Event Stream Pattern

FridayChain Arena uses Linera's **event streaming** for Hub → Player communication:

1. **Hub emits events** on the `"tournament"` stream using `runtime.emit()`
2. **Player chains subscribe** via the `SubscribeToHub` operation calling `runtime.subscribe_to_events()`
3. **Player chains receive events** in `process_streams()` which calls `runtime.read_event()`

```rust
// Hub emits:
self.runtime.emit(StreamName(TOURNAMENT_STREAM.to_vec()), &ArenaEvent::TournamentStarted { ... });

// Player chain receives in process_streams():
let event = self.runtime.read_event(update.chain_id, StreamName(...), index);
match event {
    ArenaEvent::TournamentStarted { seed, ... } => {
        // Generate puzzle locally from seed
        // Set tournament state
    }
    ArenaEvent::TournamentEnded { ... } => { /* Mark tournament inactive */ }
    ArenaEvent::LeaderboardUpdated { entries } => { /* Cache leaderboard */ }
}
```

### Direct Messages Pattern

Player → Hub uses **direct cross-chain messages** via `runtime.prepare_message().send_to(hub)`:

- `SyncPlayer` — Sent when a player registers
- `SyncCellPlacement` — Sent on every move with `penalty_count` (Hub tracks move count and computes estimated score)
- `SyncBoardComplete` — Sent when a player completes the puzzle (Hub computes score)

---

## 8. Frontend Architecture

### Technology

- **React 18.3.1** — UI framework
- **Vite 5.4.11** — Build tool with HMR
- **TypeScript 5.6.3** — Type safety
- **Tailwind CSS 3.4.15** — Styling (custom dark theme with purple/gold accents)
- **@linera/client ^0.15.8** — WASM module for trustless chain interaction

### Key Frontend Files

| File | Purpose |
|------|---------|
| `lineraClient.ts` | Singleton WASM client, session persistence, query/mutate helpers |
| `useArena.tsx` | React context provider — connection, player, tournament, game state |
| `useLeaderboard.ts` | Polls Hub chain for live leaderboard (every 5s, silent refresh) |
| `useTournament.ts` | Countdown timer, time remaining calculations |
| `arenaApi.ts` | High-level API wrapping GraphQL queries and mutations |
| `queries.ts` | All GraphQL query/mutation strings |
| `types.ts` | TypeScript types mirroring Rust structs |
| `GamePlayPage.tsx` | Main game screen — Sudoku grid, stats, Arena Rating, mini leaderboard |
| `LeaderboardPage.tsx` | Full leaderboard with Progress bar, Arena Rating, scoring info |
| `LeaderboardTable.tsx` | Reusable leaderboard table with live Arena Rating computation |

### Connection Flow

```
1. User clicks "Connect MetaMask"
2. MetaMask returns EVM address (e.g., 0xf76e...71a3)
3. WASM module initializes (@linera/client)
4. Faucet creates a wallet (genesis config)
5. PrivateKey signer restored from localStorage (or generated fresh)
6. Faucet claims a new microchain for the signer
7. Client, Chain, and Application handles created
8. Hub chain application handle created (for tournament/leaderboard queries)
9. Session persisted: { privateKeyHex, signerAddress, evmAddress, appId }
10. Auto-re-register if previously registered (silent, non-blocking)
11. Subscribe to Hub events (non-blocking)
12. Poll tournament + game state every 3 seconds
```

### Session Persistence

The `PrivateKey` (32 random bytes) is stored in `localStorage` keyed by MetaMask address:

```typescript
interface StoredSession {
  privateKeyHex: string;      // The actual signing key
  signerAddress: string;      // Derived address (e.g., 0x52daAA67...)
  evmAddress: string;         // MetaMask address (e.g., 0xf76e6b09...)
  discordUsername?: string;    // Player's registered name
  registeredAt?: string;      // Registration timestamp
  appId?: string;             // Current App ID (for redeployment detection)
}
```

**On App ID change** (new contract deployment): The session preserves the private key and username but clears `registeredAt`, triggering a silent auto-re-register on the new contract.

### Dual Identity System

| Identity | Source | Used For |
|----------|--------|----------|
| **MetaMask address** | `window.ethereum` | Display identity, session key |
| **Signer address** | `PrivateKey` in WASM | On-chain identity, signing transactions |

The MetaMask address is only used for display and localStorage lookup. The actual on-chain identity is the `PrivateKey` signer address, which is what the contract sees via `runtime.authenticated_signer()`.

---

## 9. How the Game Works End-to-End

### Player Journey

```
1. CONNECT
   └── MetaMask → WASM init → Faucet → Claim chain → Ready

2. REGISTER
   └── Enter Discord username → RegisterPlayer mutation
       → Saved on player chain → SyncPlayer sent to Hub

3. SUBSCRIBE
   └── SubscribeToHub mutation → Player chain subscribes to Hub's event stream

4. WAIT FOR TOURNAMENT
   └── Admin starts tournament on Hub
       → Hub emits TournamentStarted event
       → Player chain receives via process_streams()
       → Generates puzzle locally from seed

5. PLAY
   └── Click cell → Select number → PlaceCell mutation
       → Contract validates Sudoku rules
       → If invalid: penalty_count++
       → Board updated on player chain
       → SyncCellPlacement sent to Hub (move tracking)

6. COMPLETE
   └── Board matches solution → SyncBoardComplete sent to Hub
       → Hub computes final score
       → LeaderboardUpdated event emitted
       → All connected players see updated rankings

7. TOURNAMENT ENDS
   └── Admin calls EndTournament on Hub
       → TournamentEnded event with final rankings
       → All player chains receive and display results
```

### What the Player Sees

- **Sudoku grid** — 9×9 with given cells (dark blue, non-editable) and empty cells (clickable)
- **Game Stats** — Moves count, Penalties count (red if > 0), Cells filled (X/81)
- **Tournament info** — Players count, Completions count, Seed number
- **Your Rating** — Live Arena Rating with progress bonus (gold glow, ticks every second)
- **Mini Leaderboard** — Top 5 players ranked by Arena Rating with medals (🥇🥈🥉), "(you)" label
- **Arena Rating info** — Base points, time penalty, move penalty, progress bonus explained
- **Countdown Timer** — Time remaining in the tournament (red text)

### What the Leaderboard Page Shows

- **Rank** — Medals for top 3 (🥇🥈🥉), numbers for rest
- **Player** — Discord username + abbreviated wallet address
- **Rating** — Live Arena Rating with green "+X progress" breakdown for in-progress players
- **Time** — Completion time (formatted as M:SS) or "--" for in-progress
- **Progress** — X/46 cells solved with a visual progress bar
- **Moves** — Total placement count
- **Penalties** — Invalid placement count (red if > 0, green if 0)
- **Status** — "Solved" (green) or "Playing" (amber)

---

## 10. Tournament Lifecycle (CLI Commands)

### Prerequisites

```bash
# Ensure linera CLI is configured with the admin wallet
# The admin wallet is the one that created the application
# Default owner: 0x939d2ab6bb9bc5e2d6cd62ac9bfa2553ea4bfc243e448504d8a60bb2e93cd5c2

# Start the linera service (GraphQL endpoint for the admin wallet)
linera service --port 8080
```

### Start a Tournament

```bash
curl -s -X POST \
  http://localhost:8080/chains/2ca95eb46924cab776124861fbaa920ed9f6189dfc72b0a98e8c8d026aaf637f/applications/ea6d34dfcb94694103377d4219a25703624b3d6536ea09a65bceb82c4255f9c5 \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation { startTournament(seed: 200, durationSecs: 3600) { ... on TournamentStartedResponse { tournamentId seed startTimeMicros endTimeMicros } ... on ErrorResponse { message } } }"
  }'
```

**Parameters:**
- `seed` — Any `u64` number. Determines the puzzle. Same seed = same puzzle.
- `durationSecs` — Tournament length in seconds. `3600` = 1 hour.

**What happens:**
1. Contract asserts the caller is the admin
2. Contract asserts this is the Hub chain
3. Contract asserts no tournament is currently active
4. Generates the Sudoku puzzle from the seed
5. Creates the Tournament struct with start/end timestamps
6. Emits `TournamentStarted` event on the tournament stream
7. All subscribed player chains receive the event and generate the puzzle locally

### Check Tournament Status

```bash
curl -s -X POST \
  http://localhost:8080/chains/2ca95eb46924cab776124861fbaa920ed9f6189dfc72b0a98e8c8d026aaf637f/applications/ea6d34dfcb94694103377d4219a25703624b3d6536ea09a65bceb82c4255f9c5 \
  -H 'Content-Type: application/json' \
  -d '{"query": "{ activeTournament { id seed startTimeMicros endTimeMicros active totalPlayers totalCompletions } }"}'
```

### Check Leaderboard

```bash
curl -s -X POST \
  http://localhost:8080/chains/2ca95eb46924cab776124861fbaa920ed9f6189dfc72b0a98e8c8d026aaf637f/applications/ea6d34dfcb94694103377d4219a25703624b3d6536ea09a65bceb82c4255f9c5 \
  -H 'Content-Type: application/json' \
  -d '{"query": "{ leaderboard(limit: 50) { wallet discordUsername score completionTimeMicros penaltyCount moveCount completed } }"}'
```

### End a Tournament

```bash
curl -s -X POST \
  http://localhost:8080/chains/2ca95eb46924cab776124861fbaa920ed9f6189dfc72b0a98e8c8d026aaf637f/applications/ea6d34dfcb94694103377d4219a25703624b3d6536ea09a65bceb82c4255f9c5 \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "mutation { endTournament { ... on TournamentEndedResponse { tournamentId totalPlayers totalCompletions } ... on ErrorResponse { message } } }"
  }'
```

**What happens:**
1. Contract asserts admin + Hub chain
2. Marks tournament as inactive
3. Gets sorted leaderboard (final rankings)
4. Pushes tournament to `past_tournaments` log
5. Emits `TournamentEnded` event with final rankings
6. All player chains receive and display final results

---

## 11. Why This Game Cannot Be Cheated

### 1. Solution Is Never Exposed

The `SudokuBoard` struct contains both `puzzle` and `solution`, but the GraphQL service **only exposes `puzzleBoard`** (the puzzle grid with empty cells). The solution field is never returned:

```rust
// service.rs — only exposes the puzzle, NEVER the solution
async fn puzzle_board(&self) -> Option<Vec<Vec<u8>>> {
    self.state.current_puzzle.get().as_ref().map(|board| {
        board.puzzle.iter().map(|row| row.to_vec()).collect()
    })
}
```

There is **no GraphQL query** that returns `board.solution`. A player cannot query the solution from the chain.

### 2. Every Move Is Authenticated

The contract uses `runtime.authenticated_signer()` for every operation. You cannot:
- Place a cell as another player
- Modify another player's game state
- Register under someone else's account

### 3. Sudoku Rules Are Enforced On-Chain

The `validate_placement()` function checks real Sudoku rules (row/column/3×3 box). An invalid move is:
- **Still placed** on the board (the player can continue)
- **Counted as a penalty** (-100 points per invalid move)
- **Recorded on-chain** — visible in the move history

### 4. Time Is Measured by the Contract

The contract reads time from `runtime.system_time()` — the **blockchain's timestamp**, not the client's clock. A player cannot manipulate their completion time.

### 5. Score Is Computed by the Hub

When a player completes the board, their player chain sends `SyncBoardComplete` to the Hub. The **Hub chain** computes the score from:
- `tournament.start_time_micros` (set by admin when tournament started)
- `completion_time_micros` (set by the player's contract when board completed)
- `penalty_count` (accumulated during gameplay)

The player's client shows an **estimate** but the **real score** is computed by the Hub contract and cannot be faked.

### 6. Completion Requires Full Board Match

The board is only marked as complete when **every cell exactly matches the solution**:

```rust
pub fn check_complete(&self, solution: &[[u8; 9]; 9]) -> bool {
    for r in 0..9 {
        for c in 0..9 {
            if self.board[r][c] != solution[r][c] {
                return false;
            }
        }
    }
    true
}
```

### 7. Games Are Replayable and Verifiable

The `verify_game` function can replay any game from its seed and moves:

```rust
pub fn verify_game(seed: u64, moves: &[(u8, u8, u8)]) -> VerifyResult {
    // Regenerate puzzle → replay moves → count penalties → check completion
}
```

This is exposed as a GraphQL query — anyone can audit any game.

### 8. Deterministic Puzzle Generation

The same seed ALWAYS generates the same puzzle, thanks to `ChaCha8Rng::seed_from_u64()`. The admin cannot generate a "special" puzzle for any player — all players get the exact same puzzle from the same seed.

### 9. Admin Cannot Cheat Either

- Admin can only `StartTournament` and `EndTournament` on the Hub chain
- Admin cannot modify leaderboard entries, player scores, or game states
- Admin cannot access the solution through any special API
- The `assert_admin()` check only gates tournament management, not scoring

### 10. Append-Only Audit Trail

All events are pushed to `event_log: LogView<ArenaEvent>` and `leaderboard_log: LogView<LeaderboardEntry>`. These are **append-only** — entries can never be deleted or modified.

---

## 12. Tech Stack

### Backend (On-Chain)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Linera SDK | 0.15.8 | Smart contract framework |
| Rust | 1.86.0 | Contract language |
| WASM (wasm32-unknown-unknown) | — | Compilation target |
| async-graphql | =7.0.17 | GraphQL schema for service layer |
| rand_chacha | 0.3 | Deterministic puzzle generation |
| rand | 0.8 | RNG interface (no default features for WASM) |
| serde | 1.0 | Serialization |

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18.3.1 | UI framework |
| Vite | 5.4.11 | Build tool + dev server |
| TypeScript | 5.6.3 | Type safety |
| Tailwind CSS | 3.4.15 | Styling |
| @linera/client | ^0.15.8 | WASM module for chain interaction |

### Infrastructure

| Component | Value |
|-----------|-------|
| Network | Conway Testnet |
| Faucet | https://faucet.testnet-conway.linera.net |
| Hub Chain | `2ca95eb46924cab776124861fbaa920ed9f6189dfc72b0a98e8c8d026aaf637f` |
| App ID (v5) | `ea6d34dfcb94694103377d4219a25703624b3d6536ea09a65bceb82c4255f9c5` |
| Admin Owner | `0x939d2ab6bb9bc5e2d6cd62ac9bfa2553ea4bfc243e448504d8a60bb2e93cd5c2` |

---

## 13. Deployment Details

### Build

```bash
cd /home/devmo/FridayChain-Arena
cargo build --release --target wasm32-unknown-unknown
```

Produces two WASM binaries:
- `target/wasm32-unknown-unknown/release/fridaychain_arena_contract.wasm`
- `target/wasm32-unknown-unknown/release/fridaychain_arena_service.wasm`

### Deploy (Publish & Create)

```bash
linera publish-and-create \
  target/wasm32-unknown-unknown/release/fridaychain_arena_contract.wasm \
  target/wasm32-unknown-unknown/release/fridaychain_arena_service.wasm \
  --json-parameters '{"hub_chain_id": "2ca95eb46924cab776124861fbaa920ed9f6189dfc72b0a98e8c8d026aaf637f"}' \
  --json-argument '{"hub_chain_id": "2ca95eb46924cab776124861fbaa920ed9f6189dfc72b0a98e8c8d026aaf637f"}'
```

This returns the **App ID** which must be set in `frontend/.env`:

```env
VITE_APP_ID=ea6d34dfcb94694103377d4219a25703624b3d6536ea09a65bceb82c4255f9c5
VITE_HUB_CHAIN_ID=2ca95eb46924cab776124861fbaa920ed9f6189dfc72b0a98e8c8d026aaf637f
VITE_FAUCET_URL=https://faucet.testnet-conway.linera.net
```

### Run Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Run Admin Service (for tournament management)

```bash
linera service --port 8080
# → GraphQL endpoint at http://localhost:8080
```

---

## 14. File Structure

```
FridayChain-Arena/
├── Cargo.toml                          # Workspace root
├── rust-toolchain.toml                 # Rust 1.86.0 pinned
├── SUMMARY.md                         # This file
│
├── contracts/
│   └── fridaychain-arena/
│       ├── Cargo.toml                  # Contract dependencies
│       └── src/
│           ├── lib.rs                  # ABI, types, enums, shared structs
│           ├── contract.rs             # Contract binary — all write logic
│           ├── service.rs              # Service binary — GraphQL read layer
│           ├── state.rs                # ArenaState with Linera Views
│           └── sudoku.rs               # Deterministic Sudoku engine
│
├── frontend/
│   ├── .env                            # App ID, Hub Chain ID, Faucet URL
│   ├── package.json                    # npm dependencies
│   ├── vite.config.ts                  # Vite + WASM plugin config
│   ├── tailwind.config.js              # Custom arena theme
│   ├── vercel.json                     # Vercel deployment config
│   │
│   └── src/
│       ├── App.tsx                     # Router + ArenaProvider
│       ├── main.tsx                    # Entry point
│       │
│       ├── lib/
│       │   ├── linera/
│       │   │   └── lineraClient.ts     # WASM client singleton + session persistence
│       │   ├── metamask/
│       │   │   └── metamaskSigner.ts   # MetaMask connection helper
│       │   └── arena/
│       │       ├── arenaApi.ts         # High-level API (register, play, query)
│       │       ├── queries.ts          # GraphQL query/mutation strings
│       │       └── types.ts            # TypeScript types mirroring Rust structs
│       │
│       ├── hooks/
│       │   ├── useArena.tsx            # Main context provider + hook
│       │   ├── useLeaderboard.ts       # Hub chain leaderboard polling
│       │   └── useTournament.ts        # Countdown timer hook
│       │
│       ├── pages/
│       │   ├── HomePage.tsx            # Landing page
│       │   ├── GamePlayPage.tsx        # Main game screen
│       │   ├── LeaderboardPage.tsx     # Full leaderboard + scoring info
│       │   └── ProfilePage.tsx         # Player profile
│       │
│       └── components/
│           ├── SudokuGrid.tsx          # Interactive 9×9 grid component│           ├── LeaderboardTable.tsx     # Leaderboard table with live Arena Rating + progress bar│           ├── CountdownTimer.tsx      # Tournament countdown
│           ├── Navbar.tsx              # Navigation bar
│           └── Layout.tsx              # Page layout wrapper
```

---

## Summary

FridayChain Arena demonstrates that **complex, competitive multiplayer games can run entirely on-chain** with Linera's microchain architecture. Every move, every score, every ranking is trustlessly computed and permanently recorded. No server can be taken down to kill the game. No admin can fake a score. No player can cheat the system. The blockchain is the game engine, the database, and the referee — all in one.

**Built with ❤️ on Linera by devmo.**

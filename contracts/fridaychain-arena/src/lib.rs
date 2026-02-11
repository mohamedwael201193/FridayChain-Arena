// Copyright (c) FridayChain Arena Contributors
// SPDX-License-Identifier: MIT

//! FridayChain Arena — Fully On-Chain Competitive Sudoku Tournament System
//!
//! ABI definitions and shared types for the Linera microchain application.

#![allow(clippy::large_enum_variant)]

use async_graphql::{InputObject, SimpleObject, Union};
use linera_sdk::{
    linera_base_types::{AccountOwner, ChainId},
    graphql::GraphQLMutationRoot,
};
use serde::{Deserialize, Serialize};
use linera_sdk::linera_base_types::{ContractAbi, ServiceAbi};

pub mod sudoku;

/// The Application Binary Interface marker.
pub struct FridayChainArenaAbi;

/// Application parameters — available on ALL chains (hub + player).
/// Set at publish-and-create time via --json-parameters.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ArenaParameters {
    pub hub_chain_id: ChainId,
}

impl ContractAbi for FridayChainArenaAbi {
    type Operation = Operation;
    type Response = ArenaResponse;
}

impl ServiceAbi for FridayChainArenaAbi {
    type Query = async_graphql::Request;
    type QueryResponse = async_graphql::Response;
}

// ---------------------------------------------------------------------------
// Instantiation
// ---------------------------------------------------------------------------

/// Arguments provided when the application is first created.
#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject, InputObject)]
#[graphql(input_name = "InstantiationArgumentInput")]
pub struct InstantiationArgument {
    /// The chain ID that acts as the Hub (global state aggregator).
    pub hub_chain_id: ChainId,
}

// ---------------------------------------------------------------------------
// Operations (user-facing mutations via GraphQL)
// ---------------------------------------------------------------------------

/// All operations that can be executed on the FridayChain Arena contract.
#[derive(Clone, Debug, Serialize, Deserialize, GraphQLMutationRoot)]
pub enum Operation {
    // ── Player Identity ──────────────────────────────────────────────────

    /// Register a new player with their Discord username.
    /// Links the authenticated MetaMask signer to the username on-chain.
    RegisterPlayer {
        discord_username: String,
    },

    /// Update the Discord username (costs an on-chain transaction).
    UpdateUsername {
        new_discord_username: String,
    },

    // ── Gameplay ─────────────────────────────────────────────────────────

    /// Place a number in a Sudoku cell during an active tournament.
    /// The contract validates Sudoku rules and records penalties for invalid moves.
    PlaceCell {
        row: u8,
        col: u8,
        value: u8,
    },

    /// Clear a previously placed (non-given) cell on the player's board.
    ClearCell {
        row: u8,
        col: u8,
    },

    // ── Cross-chain ──────────────────────────────────────────────────────

    /// Subscribe this player's chain to the Hub's tournament event stream.
    SubscribeToHub,

    /// Request the current leaderboard from the Hub chain.
    /// Result is delivered asynchronously via cross-chain message.
    RequestLeaderboard {
        limit: Option<u32>,
    },

    // ── Admin (Hub chain only) ───────────────────────────────────────────

    /// Start a new tournament. Admin only.
    /// `seed` determines the Sudoku puzzle deterministically.
    /// `duration_secs` is the tournament length (typically 3600 for 1 hour).
    StartTournament {
        seed: u64,
        duration_secs: u64,
    },

    /// End the current tournament and finalize rankings. Admin only.
    EndTournament,
}

// ---------------------------------------------------------------------------
// Cross-chain Messages
// ---------------------------------------------------------------------------

/// Messages sent between player chains and the Hub chain.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Message {
    // ── Player chain → Hub ───────────────────────────────────────────────

    /// Sync a player registration to the Hub.
    SyncPlayer(PlayerInfo),

    /// Notify the Hub that a player placed a cell (for move tracking).
    SyncCellPlacement {
        wallet: AccountOwner,
        row: u8,
        col: u8,
        value: u8,
        timestamp_micros: u64,
        penalty_count: u32,
    },

    /// Notify the Hub that a player completed the board.
    SyncBoardComplete {
        wallet: AccountOwner,
        completion_time_micros: u64,
        penalty_count: u32,
        move_count: u32,
    },

    // ── Leaderboard cross-chain ──────────────────────────────────────────

    /// Request leaderboard data from the Hub.
    LeaderboardRequest {
        requester_chain: ChainId,
        limit: u32,
    },

    /// Hub responds with leaderboard data.
    LeaderboardResponse {
        entries: Vec<LeaderboardEntry>,
        tournament_id: u64,
        is_active: bool,
    },

    // ── Hub → player chains (via event stream subscription) ──────────────

    /// Broadcast: a tournament has started.
    TournamentStarted {
        tournament_id: u64,
        seed: u64,
        start_time_micros: u64,
        end_time_micros: u64,
    },

    /// Broadcast: a tournament has ended.
    TournamentEnded {
        tournament_id: u64,
        final_rankings: Vec<LeaderboardEntry>,
    },
}

// ---------------------------------------------------------------------------
// Event Values (emitted on streams for subscriber chains)
// ---------------------------------------------------------------------------

/// Events emitted on the Hub's "tournament" stream.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ArenaEvent {
    /// A tournament has started.
    TournamentStarted {
        tournament_id: u64,
        seed: u64,
        start_time_micros: u64,
        end_time_micros: u64,
    },

    /// A tournament has ended with final rankings.
    TournamentEnded {
        tournament_id: u64,
        final_rankings: Vec<LeaderboardEntry>,
    },

    /// A player registered.
    PlayerRegistered {
        wallet: AccountOwner,
        discord_username: String,
    },

    /// Leaderboard updated (emitted after each board completion).
    LeaderboardUpdated {
        entries: Vec<LeaderboardEntry>,
    },
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/// The response returned from contract operations.
#[derive(Clone, Debug, Serialize, Deserialize, Union)]
pub enum ArenaResponse {
    /// Player was successfully registered.
    PlayerRegistered(PlayerRegisteredResponse),

    /// Username was updated.
    UsernameUpdated(UsernameUpdatedResponse),

    /// A cell was placed on the board.
    CellPlaced(CellPlacedResponse),

    /// A cell was cleared.
    CellCleared(CellClearedResponse),

    /// The board was completed.
    BoardCompleted(BoardCompletedResponse),

    /// A tournament was started (admin).
    TournamentStarted(TournamentStartedResponse),

    /// A tournament was ended (admin).
    TournamentEnded(TournamentEndedResponse),

    /// Leaderboard request was sent.
    LeaderboardRequested(LeaderboardRequestedResponse),

    /// Subscription to hub was established.
    Subscribed(SubscribedResponse),

    /// An error occurred.
    Error(ErrorResponse),
}

#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct PlayerRegisteredResponse {
    pub wallet: AccountOwner,
    pub discord_username: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct UsernameUpdatedResponse {
    pub wallet: AccountOwner,
    pub new_discord_username: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct CellPlacedResponse {
    pub row: u8,
    pub col: u8,
    pub value: u8,
    pub valid: bool,
    pub penalty_count: u32,
    pub board_complete: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct CellClearedResponse {
    pub row: u8,
    pub col: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct BoardCompletedResponse {
    pub completion_time_micros: u64,
    pub penalty_count: u32,
    pub score: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct TournamentStartedResponse {
    pub tournament_id: u64,
    pub seed: u64,
    pub start_time_micros: u64,
    pub end_time_micros: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct TournamentEndedResponse {
    pub tournament_id: u64,
    pub total_players: u32,
    pub total_completions: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct LeaderboardRequestedResponse {
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct SubscribedResponse {
    pub hub_chain_id: ChainId,
}

#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct ErrorResponse {
    pub message: String,
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// A registered player's profile.
#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject, InputObject)]
#[graphql(input_name = "PlayerInfoInput")]
pub struct PlayerInfo {
    pub wallet: AccountOwner,
    pub discord_username: String,
    pub registered_at_micros: u64,
}

/// A tournament descriptor.
#[derive(Clone, Debug, Default, Serialize, Deserialize, SimpleObject, InputObject)]
#[graphql(input_name = "TournamentInput")]
pub struct Tournament {
    pub id: u64,
    pub seed: u64,
    pub start_time_micros: u64,
    pub end_time_micros: u64,
    pub active: bool,
    pub total_players: u32,
    pub total_completions: u32,
}

/// A player's current game state for the active tournament.
#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct PlayerGameState {
    /// The player's current board state (0 = empty, 1-9 = placed value).
    pub board: Vec<Vec<u8>>,
    /// Which cells are pre-filled (given) and cannot be changed.
    pub given_mask: Vec<Vec<bool>>,
    /// Number of invalid placements so far.
    pub penalty_count: u32,
    /// Total moves made.
    pub move_count: u32,
    /// Timestamp (micros) when the player made their first move.
    pub start_time_micros: u64,
    /// Whether the board has been completed.
    pub completed: bool,
    /// Timestamp (micros) when the board was completed.
    pub completion_time_micros: Option<u64>,
    /// The computed score (0 if not completed).
    pub score: u64,
}

impl PlayerGameState {
    /// Create a new game state from a puzzle board.
    /// `puzzle` contains 0 for empty cells and 1-9 for given cells.
    pub fn new(puzzle: &[[u8; 9]; 9]) -> Self {
        let mut board = vec![vec![0u8; 9]; 9];
        let mut given_mask = vec![vec![false; 9]; 9];

        for r in 0..9 {
            for c in 0..9 {
                board[r][c] = puzzle[r][c];
                given_mask[r][c] = puzzle[r][c] != 0;
            }
        }

        Self {
            board,
            given_mask,
            penalty_count: 0,
            move_count: 0,
            start_time_micros: 0,
            completed: false,
            completion_time_micros: None,
            score: 0,
        }
    }

    /// Check if the board matches the solution.
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

    /// Calculate score based on completion time and penalties.
    /// Higher is better. Formula:
    ///   score = 10000 - (time_seconds * 2) - (penalties * 100)
    /// Minimum score is 0.
    /// NOTE: Must match the Hub's formula in handle_sync_board_complete.
    pub fn calculate_score(&self, start_micros: u64, end_micros: u64) -> u64 {
        let elapsed_secs = (end_micros.saturating_sub(start_micros)) / 1_000_000;
        let time_penalty = elapsed_secs.saturating_mul(2);
        let move_penalty = (self.penalty_count as u64).saturating_mul(100);
        10_000u64
            .saturating_sub(time_penalty)
            .saturating_sub(move_penalty)
    }
}

/// A leaderboard entry representing a player's tournament performance.
#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject, InputObject)]
#[graphql(input_name = "LeaderboardEntryInput")]
pub struct LeaderboardEntry {
    pub wallet: AccountOwner,
    pub discord_username: String,
    pub score: u64,
    pub completion_time_micros: u64,
    pub penalty_count: u32,
    pub move_count: u32,
    pub completed: bool,
}

/// A cached leaderboard response stored on a player's chain.
#[derive(Clone, Debug, Default, Serialize, Deserialize, SimpleObject)]
pub struct CachedLeaderboard {
    pub entries: Vec<LeaderboardEntry>,
    pub tournament_id: u64,
    pub is_active: bool,
    pub fetched_at_micros: u64,
}

/// Sudoku puzzle board with puzzle and solution.
/// The solution is NEVER exposed through the service GraphQL layer.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SudokuBoard {
    /// The puzzle grid (0 = empty, 1-9 = given value).
    pub puzzle: [[u8; 9]; 9],
    /// The complete solution grid.
    pub solution: [[u8; 9]; 9],
}

/// Input for move verification queries.
#[derive(Clone, Debug, Serialize, Deserialize, InputObject)]
pub struct MoveInput {
    pub row: u8,
    pub col: u8,
    pub value: u8,
}

/// Result of a game verification replay.
#[derive(Clone, Debug, Serialize, Deserialize, SimpleObject)]
pub struct VerifyResult {
    pub valid: bool,
    pub total_moves: u32,
    pub penalty_count: u32,
    pub final_score: u64,
    pub board_complete: bool,
}

/// Stats about the current or past tournament.
#[derive(Clone, Debug, Default, Serialize, Deserialize, SimpleObject)]
pub struct TournamentStats {
    pub tournament_id: u64,
    pub total_players: u32,
    pub total_completions: u32,
    pub average_score: u64,
    pub best_score: u64,
    pub is_active: bool,
}

// ---------------------------------------------------------------------------
// Stream names
// ---------------------------------------------------------------------------

/// The stream name used for tournament event broadcasting.
pub const TOURNAMENT_STREAM: &[u8] = b"tournament";

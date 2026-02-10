// Copyright (c) FridayChain Arena Contributors
// SPDX-License-Identifier: MIT

//! On-chain state for FridayChain Arena.
//!
//! Uses Linera Views (persistent key-value storage) as the sole data layer.
//! The same state struct is used on both Hub chains and player chains,
//! with different fields populated depending on the chain's role.

use fridaychain_arena::{
    ArenaEvent, CachedLeaderboard, LeaderboardEntry, PlayerGameState, PlayerInfo, SudokuBoard,
    Tournament, TournamentStats,
};
use linera_sdk::{
    linera_base_types::{AccountOwner, ChainId},
    views::{linera_views, LogView, MapView, RegisterView, RootView, ViewStorageContext},
};

/// The root state view for the FridayChain Arena application.
///
/// **Hub chain** uses: `players`, `leaderboard`, `active_tournament`,
/// `tournament_counter`, `event_log`, `past_tournaments`, `current_puzzle`.
///
/// **Player chains** use: `players` (local copy), `player_games`, `cached_leaderboard`,
/// `active_tournament` (synced from Hub), `current_puzzle` (generated locally from seed).
#[derive(RootView)]
#[view(context = ViewStorageContext)]
pub struct ArenaState {
    // ── Identity & Configuration ─────────────────────────────────────────

    /// The Hub chain ID. Set at instantiation.
    pub hub_chain_id: RegisterView<Option<ChainId>>,

    /// The admin account owner. Only this signer can start/end tournaments.
    /// Set at instantiation to the creator of the application.
    pub admin_owner: RegisterView<Option<AccountOwner>>,

    // ── Player Registry ──────────────────────────────────────────────────

    /// All registered players, keyed by wallet address.
    /// On Hub: global registry. On player chains: just the local player.
    pub players: MapView<AccountOwner, PlayerInfo>,

    /// Total number of registered players (Hub only).
    pub player_count: RegisterView<u64>,

    // ── Tournament State ─────────────────────────────────────────────────

    /// The currently active tournament (if any).
    pub active_tournament: RegisterView<Option<Tournament>>,

    /// Monotonically increasing tournament ID counter (Hub only).
    pub tournament_counter: RegisterView<u64>,

    /// The current Sudoku puzzle board (puzzle + solution).
    /// Generated deterministically from the tournament seed.
    /// IMPORTANT: The solution is NEVER exposed through GraphQL queries.
    pub current_puzzle: RegisterView<Option<SudokuBoard>>,

    // ── Per-Player Game State ────────────────────────────────────────────

    /// Each player's current game state for the active tournament.
    /// Keyed by wallet address.
    pub player_games: MapView<AccountOwner, PlayerGameState>,

    // ── Leaderboard (Hub chain only) ─────────────────────────────────────

    /// Current tournament leaderboard entries, keyed by wallet.
    pub leaderboard: MapView<AccountOwner, LeaderboardEntry>,

    /// Append-only log of all leaderboard updates for auditability.
    pub leaderboard_log: LogView<LeaderboardEntry>,

    // ── Event Log (Hub chain only) ───────────────────────────────────────

    /// Append-only event log for all arena events.
    pub event_log: LogView<ArenaEvent>,

    /// Total number of events emitted.
    pub event_counter: RegisterView<u64>,

    // ── Cached Leaderboard (Player chains) ───────────────────────────────

    /// Cached copy of the Hub's leaderboard, fetched via cross-chain message.
    pub cached_leaderboard: RegisterView<Option<CachedLeaderboard>>,

    // ── Historical Data (Hub chain only) ─────────────────────────────────

    /// Log of all past tournaments.
    pub past_tournaments: LogView<Tournament>,
}

impl ArenaState {
    /// Check whether this chain is the Hub chain.
    pub fn is_hub(&self) -> bool {
        // If hub_chain_id is not set, we can't determine — default to false.
        // The contract sets this at instantiation.
        false // Will be checked by the contract using runtime.chain_id()
    }

    /// Get the current tournament if it exists and is active.
    pub fn get_active_tournament(&self) -> Option<&Tournament> {
        self.active_tournament
            .get()
            .as_ref()
            .filter(|t| t.active)
    }

    /// Compute tournament statistics from the leaderboard.
    pub async fn compute_tournament_stats(&self) -> TournamentStats {
        let tournament = match self.active_tournament.get() {
            Some(t) => t.clone(),
            None => {
                return TournamentStats::default();
            }
        };

        let mut total_players = 0u32;
        let mut total_completions = 0u32;
        let mut total_score = 0u64;
        let mut best_score = 0u64;

        // Iterate over all leaderboard entries
        self.leaderboard
            .for_each_index_value(|_wallet, entry| {
                total_players += 1;
                if entry.completed {
                    total_completions += 1;
                }
                total_score += entry.score;
                if entry.score > best_score {
                    best_score = entry.score;
                }
                Ok(())
            })
            .await
            .unwrap_or(());

        let average_score = if total_players > 0 {
            total_score / total_players as u64
        } else {
            0
        };

        TournamentStats {
            tournament_id: tournament.id,
            total_players,
            total_completions,
            average_score,
            best_score,
            is_active: tournament.active,
        }
    }

    /// Collect leaderboard entries sorted by score descending.
    pub async fn get_sorted_leaderboard(&self, limit: u32) -> Vec<LeaderboardEntry> {
        let mut entries = Vec::new();

        self.leaderboard
            .for_each_index_value(|_wallet, entry| {
                entries.push(entry.into_owned());
                Ok(())
            })
            .await
            .unwrap_or(());

        // Sort: completed first (by score desc, then completion time asc),
        // then in-progress (by estimated score desc, then fewer penalties, then more moves)
        entries.sort_by(|a, b| {
            match (a.completed, b.completed) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                (true, true) => {
                    b.score.cmp(&a.score)
                        .then(a.completion_time_micros.cmp(&b.completion_time_micros))
                }
                (false, false) => {
                    b.score.cmp(&a.score)
                        .then(a.penalty_count.cmp(&b.penalty_count))
                        .then(b.move_count.cmp(&a.move_count))
                }
            }
        });

        entries.truncate(limit as usize);
        entries
    }
}

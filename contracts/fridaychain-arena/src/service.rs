#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use std::sync::Arc;

use self::state::ArenaState;
use fridaychain_arena::{
    sudoku, ArenaParameters, CachedLeaderboard, FridayChainArenaAbi, LeaderboardEntry,
    MoveInput, Operation, PlayerGameState, PlayerInfo, Tournament, TournamentStats,
    VerifyResult,
};
use async_graphql::{EmptySubscription, Object, Request, Response, Schema};
use linera_sdk::{
    linera_base_types::WithServiceAbi,
    graphql::GraphQLMutationRoot,
    views::{RootView, View},
    Service, ServiceRuntime,
};

pub struct FridayChainArenaService {
    state: Arc<ArenaState>,
    runtime: Arc<ServiceRuntime<Self>>,
}

linera_sdk::service!(FridayChainArenaService);

impl WithServiceAbi for FridayChainArenaService {
    type Abi = FridayChainArenaAbi;
}

impl Service for FridayChainArenaService {
    type Parameters = ArenaParameters;

    async fn new(runtime: ServiceRuntime<Self>) -> Self {
        let state = ArenaState::load(runtime.root_view_storage_context())
            .await
            .expect("Failed to load state");
        Self {
            state: Arc::new(state),
            runtime: Arc::new(runtime),
        }
    }

    async fn handle_query(&self, request: Request) -> Response {
        let schema = Schema::build(
            QueryRoot { state: self.state.clone() },
            Operation::mutation_root(self.runtime.clone()),
            EmptySubscription,
        )
        .finish();
        schema.execute(request).await
    }
}

struct QueryRoot {
    state: Arc<ArenaState>,
}

#[Object]
impl QueryRoot {
    async fn player(&self, wallet: String) -> Option<PlayerInfo> {
        let owner = parse_account_owner(&wallet)?;
        self.state.players.get(&owner).await.unwrap_or(None)
    }

    async fn all_players(&self) -> Vec<PlayerInfo> {
        let mut players = Vec::new();
        self.state.players.for_each_index_value(|_wallet, info| {
            players.push(info.into_owned());
            Ok(())
        }).await.unwrap_or(());
        players
    }

    async fn player_count(&self) -> u64 {
        *self.state.player_count.get()
    }

    async fn active_tournament(&self) -> Option<Tournament> {
        self.state.active_tournament.get().clone()
    }

    async fn puzzle_board(&self) -> Option<Vec<Vec<u8>>> {
        self.state.current_puzzle.get().as_ref().map(|board| {
            board.puzzle.iter().map(|row| row.to_vec()).collect()
        })
    }

    async fn is_tournament_active(&self) -> bool {
        self.state.active_tournament.get()
            .as_ref().map(|t| t.active).unwrap_or(false)
    }

    async fn player_game_state(&self, wallet: String) -> Option<PlayerGameState> {
        let owner = parse_account_owner(&wallet)?;
        self.state.player_games.get(&owner).await.unwrap_or(None)
    }

    async fn leaderboard(&self, limit: Option<u32>) -> Vec<LeaderboardEntry> {
        let limit = limit.unwrap_or(50).min(200);
        self.state.get_sorted_leaderboard(limit).await
    }

    async fn cached_leaderboard(&self) -> Option<CachedLeaderboard> {
        self.state.cached_leaderboard.get().clone()
    }

    async fn tournament_stats(&self) -> TournamentStats {
        self.state.compute_tournament_stats().await
    }

    async fn past_tournaments(&self, limit: Option<u32>) -> Vec<Tournament> {
        let limit = limit.unwrap_or(10).min(100) as usize;
        let count = self.state.past_tournaments.count();
        let start = count.saturating_sub(limit);
        let mut tournaments = Vec::new();
        for i in start..count {
            if let Ok(Some(t)) = self.state.past_tournaments.get(i).await {
                tournaments.push(t);
            }
        }
        tournaments.reverse();
        tournaments
    }

    async fn verify_game(&self, seed: u64, moves: Vec<MoveInput>) -> VerifyResult {
        let move_tuples: Vec<(u8, u8, u8)> = moves
            .into_iter()
            .map(|m| (m.row, m.col, m.value))
            .collect();
        sudoku::verify_game(seed, &move_tuples)
    }

    async fn recent_events(&self, limit: Option<u32>) -> Vec<String> {
        let limit = limit.unwrap_or(20).min(100) as usize;
        let count = self.state.event_log.count();
        let start = count.saturating_sub(limit);
        let mut events = Vec::new();
        for i in start..count {
            if let Ok(Some(event)) = self.state.event_log.get(i).await {
                events.push(format!("{:?}", event));
            }
        }
        events.reverse();
        events
    }

    async fn event_count(&self) -> u64 {
        *self.state.event_counter.get()
    }
}

fn parse_account_owner(s: &str) -> Option<linera_sdk::linera_base_types::AccountOwner> {
    linera_sdk::serde_json::from_str::<linera_sdk::linera_base_types::AccountOwner>(
        &format!("\"{}\"", s)
    ).ok()
}

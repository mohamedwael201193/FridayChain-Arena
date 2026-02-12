#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use self::state::ArenaState;
use fridaychain_arena::{
    sudoku, ArenaEvent, ArenaParameters, ArenaResponse, BoardCompletedResponse,
    CachedLeaderboard, CellClearedResponse, CellPlacedResponse, ErrorResponse,
    FridayChainArenaAbi, InstantiationArgument, LeaderboardEntry, LeaderboardRequestedResponse,
    Message, Operation, PlayerGameState, PlayerInfo, PlayerRegisteredResponse, SubscribedResponse,
    Tournament, TournamentEndedResponse, TournamentStartedResponse, UsernameUpdatedResponse,
    TOURNAMENT_STREAM,
};
use linera_sdk::{
    linera_base_types::{AccountOwner, ChainId, StreamName, StreamUpdate, WithContractAbi},
    views::{RootView, View},
    Contract, ContractRuntime,
};

pub struct FridayChainArenaContract {
    state: ArenaState,
    runtime: ContractRuntime<Self>,
}

linera_sdk::contract!(FridayChainArenaContract);

impl WithContractAbi for FridayChainArenaContract {
    type Abi = FridayChainArenaAbi;
}

impl Contract for FridayChainArenaContract {
    type Message = Message;
    type InstantiationArgument = InstantiationArgument;
    type Parameters = ArenaParameters;
    type EventValue = ArenaEvent;

    async fn load(runtime: ContractRuntime<Self>) -> Self {
        let state = ArenaState::load(runtime.root_view_storage_context())
            .await
            .expect("Failed to load state");
        Self { state, runtime }
    }

    async fn instantiate(&mut self, _arg: InstantiationArgument) {
        // hub_chain_id is now in Parameters (available on ALL chains)
        let params = self.runtime.application_parameters();
        self.state.hub_chain_id.set(Some(params.hub_chain_id));
        let admin = self
            .runtime
            .authenticated_signer()
            .expect("Instantiation must be authenticated");
        self.state.admin_owner.set(Some(admin));
    }

    async fn execute_operation(&mut self, operation: Operation) -> ArenaResponse {
        match operation {
            Operation::RegisterPlayer { discord_username } => {
                self.handle_register_player(discord_username).await
            }
            Operation::UpdateUsername { new_discord_username } => {
                self.handle_update_username(new_discord_username).await
            }
            Operation::PlaceCell { row, col, value } => {
                self.handle_place_cell(row, col, value).await
            }
            Operation::ClearCell { row, col } => self.handle_clear_cell(row, col).await,
            Operation::SubscribeToHub => self.handle_subscribe_to_hub().await,
            Operation::RequestLeaderboard { limit } => {
                self.handle_request_leaderboard(limit).await
            }
            Operation::StartTournament { seed, duration_secs } => {
                self.handle_start_tournament(seed, duration_secs).await
            }
            Operation::EndTournament => self.handle_end_tournament().await,
        }
    }

    async fn process_streams(&mut self, updates: Vec<StreamUpdate>) {
        for update in updates {
            for index in update.new_indices() {
                let event = self.runtime.read_event(
                    update.chain_id,
                    StreamName(TOURNAMENT_STREAM.to_vec()),
                    index,
                );
                match event {
                    ArenaEvent::TournamentStarted {
                        tournament_id, seed, start_time_micros, end_time_micros,
                    } => {
                        self.handle_tournament_started_msg(
                            tournament_id, seed, start_time_micros, end_time_micros,
                        ).await;
                    }
                    ArenaEvent::TournamentEnded {
                        tournament_id, final_rankings,
                    } => {
                        self.handle_tournament_ended_msg(
                            tournament_id, final_rankings,
                        ).await;
                    }
                    ArenaEvent::LeaderboardUpdated { entries } => {
                        let tournament_id = self.state.active_tournament.get()
                            .as_ref().map(|t| t.id).unwrap_or(0);
                        let is_active = self.state.active_tournament.get()
                            .as_ref().map(|t| t.active).unwrap_or(false);
                        let now = self.now_micros();
                        self.state.cached_leaderboard.set(Some(CachedLeaderboard {
                            entries, tournament_id, is_active, fetched_at_micros: now,
                        }));
                    }
                    ArenaEvent::PlayerRegistered { .. } => {
                        // Player registration events are informational; no action needed.
                    }
                }
            }
        }
    }

    async fn execute_message(&mut self, message: Message) {
        match message {
            Message::SyncPlayer(player_info) => {
                self.handle_sync_player(player_info).await;
            }
            Message::SyncCellPlacement { wallet, row, col, value, timestamp_micros, penalty_count } => {
                self.handle_sync_cell_placement(wallet, row, col, value, timestamp_micros, penalty_count).await;
            }
            Message::SyncBoardComplete { wallet, completion_time_micros, penalty_count, move_count } => {
                self.handle_sync_board_complete(wallet, completion_time_micros, penalty_count, move_count).await;
            }
            Message::LeaderboardRequest { requester_chain, limit } => {
                self.handle_leaderboard_request(requester_chain, limit).await;
            }
            Message::LeaderboardResponse { entries, tournament_id, is_active } => {
                self.handle_leaderboard_response(entries, tournament_id, is_active).await;
            }
            Message::TournamentStarted { tournament_id, seed, start_time_micros, end_time_micros } => {
                self.handle_tournament_started_msg(tournament_id, seed, start_time_micros, end_time_micros).await;
            }
            Message::TournamentEnded { tournament_id, final_rankings } => {
                self.handle_tournament_ended_msg(tournament_id, final_rankings).await;
            }
        }
    }

    async fn store(mut self) {
        self.state.save().await.expect("Failed to save state");
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

impl FridayChainArenaContract {
    fn hub_chain_id(&mut self) -> ChainId {
        // Read from Parameters — always available on every chain
        self.runtime.application_parameters().hub_chain_id
    }

    fn is_hub(&mut self) -> bool {
        let hub = self.hub_chain_id();
        self.runtime.chain_id() == hub
    }

    fn assert_admin(&mut self) {
        let signer = self.runtime.authenticated_signer()
            .expect("Operation must be authenticated");
        match self.state.admin_owner.get() {
            Some(admin) => assert_eq!(&signer, admin, "Only admin can perform this operation"),
            None => panic!("Admin not set"),
        }
    }

    fn signer(&mut self) -> AccountOwner {
        self.runtime.authenticated_signer()
            .expect("Operation must be authenticated")
    }

    fn send_to_hub(&mut self, message: Message) {
        let hub = self.hub_chain_id();
        let current = self.runtime.chain_id();
        if current != hub {
            self.runtime
                .prepare_message(message)
                .with_authentication()
                .send_to(hub);
        }
    }

    fn now_micros(&mut self) -> u64 {
        self.runtime.system_time().micros()
    }
}

// ---------------------------------------------------------------------------
// Operation Handlers
// ---------------------------------------------------------------------------

impl FridayChainArenaContract {
    async fn handle_register_player(&mut self, discord_username: String) -> ArenaResponse {
        if discord_username.is_empty() || discord_username.len() > 32 {
            return ArenaResponse::Error(ErrorResponse {
                message: "Discord username must be 1-32 characters".into(),
            });
        }

        let wallet = self.signer();
        let now = self.now_micros();

        if self.state.players.contains_key(&wallet).await.unwrap_or(false) {
            return ArenaResponse::Error(ErrorResponse {
                message: "Player already registered. Use UpdateUsername to change.".into(),
            });
        }

        let player_info = PlayerInfo {
            wallet,
            discord_username: discord_username.clone(),
            registered_at_micros: now,
        };

        self.state.players.insert(&wallet, player_info.clone())
            .expect("Failed to insert player");
        self.send_to_hub(Message::SyncPlayer(player_info));

        ArenaResponse::PlayerRegistered(PlayerRegisteredResponse { wallet, discord_username })
    }

    async fn handle_update_username(&mut self, new_discord_username: String) -> ArenaResponse {
        if new_discord_username.is_empty() || new_discord_username.len() > 32 {
            return ArenaResponse::Error(ErrorResponse {
                message: "Discord username must be 1-32 characters".into(),
            });
        }

        let wallet = self.signer();

        match self.state.players.get(&wallet).await.unwrap_or(None) {
            Some(mut player) => {
                player.discord_username = new_discord_username.clone();
                self.state.players.insert(&wallet, player.clone())
                    .expect("Failed to update player");
                self.send_to_hub(Message::SyncPlayer(player));
                ArenaResponse::UsernameUpdated(UsernameUpdatedResponse { wallet, new_discord_username })
            }
            None => ArenaResponse::Error(ErrorResponse {
                message: "Player not registered. Register first.".into(),
            }),
        }
    }

    async fn handle_place_cell(&mut self, row: u8, col: u8, value: u8) -> ArenaResponse {
        let wallet = self.signer();
        let now = self.now_micros();

        // Check registered
        if self.state.players.get(&wallet).await.unwrap_or(None).is_none() {
            return ArenaResponse::Error(ErrorResponse {
                message: "Player not registered".into(),
            });
        }

        // Check tournament active
        let tournament = match self.state.get_active_tournament() {
            Some(t) => t.clone(),
            None => {
                return ArenaResponse::Error(ErrorResponse {
                    message: "No active tournament".into(),
                });
            }
        };

        if now < tournament.start_time_micros || now > tournament.end_time_micros {
            return ArenaResponse::Error(ErrorResponse {
                message: "Tournament time window has expired".into(),
            });
        }

        if row > 8 || col > 8 || value < 1 || value > 9 {
            return ArenaResponse::Error(ErrorResponse {
                message: "Invalid cell coordinates or value".into(),
            });
        }

        let r = row as usize;
        let c = col as usize;

        let puzzle = match self.state.current_puzzle.get() {
            Some(board) => board.clone(),
            None => {
                return ArenaResponse::Error(ErrorResponse {
                    message: "Puzzle not loaded for this tournament".into(),
                });
            }
        };

        let mut game_state = match self.state.player_games.get(&wallet).await.unwrap_or(None) {
            Some(gs) => gs,
            None => {
                let mut gs = PlayerGameState::new(&puzzle.puzzle);
                gs.start_time_micros = now;
                gs
            }
        };

        if game_state.completed {
            return ArenaResponse::Error(ErrorResponse {
                message: "Board already completed".into(),
            });
        }

        if game_state.given_mask[r][c] {
            return ArenaResponse::Error(ErrorResponse {
                message: "Cannot modify a given cell".into(),
            });
        }

        let valid = sudoku::validate_placement(&game_state.board, r, c, value);
        if !valid {
            game_state.penalty_count += 1;
        }

        game_state.board[r][c] = value;
        game_state.move_count += 1;

        let board_complete = game_state.check_complete(&puzzle.solution);

        if board_complete {
            game_state.completed = true;
            game_state.completion_time_micros = Some(now);
            game_state.score = game_state.calculate_score(tournament.start_time_micros, now);

            self.send_to_hub(Message::SyncBoardComplete {
                wallet,
                completion_time_micros: now,
                penalty_count: game_state.penalty_count,
                move_count: game_state.move_count,
            });
        }

        self.state.player_games.insert(&wallet, game_state.clone())
            .expect("Failed to save game state");

        self.send_to_hub(Message::SyncCellPlacement {
            wallet, row, col, value, timestamp_micros: now,
            penalty_count: game_state.penalty_count,
        });

        if board_complete {
            ArenaResponse::BoardCompleted(BoardCompletedResponse {
                completion_time_micros: now,
                penalty_count: game_state.penalty_count,
                score: game_state.score,
            })
        } else {
            ArenaResponse::CellPlaced(CellPlacedResponse {
                row, col, value, valid,
                penalty_count: game_state.penalty_count,
                board_complete: false,
            })
        }
    }

    async fn handle_clear_cell(&mut self, row: u8, col: u8) -> ArenaResponse {
        let wallet = self.signer();
        let now = self.now_micros();

        let tournament = match self.state.get_active_tournament() {
            Some(t) => t.clone(),
            None => {
                return ArenaResponse::Error(ErrorResponse {
                    message: "No active tournament".into(),
                });
            }
        };

        if now < tournament.start_time_micros || now > tournament.end_time_micros {
            return ArenaResponse::Error(ErrorResponse {
                message: "Tournament time window has expired".into(),
            });
        }

        if row > 8 || col > 8 {
            return ArenaResponse::Error(ErrorResponse {
                message: "Invalid cell coordinates".into(),
            });
        }

        let r = row as usize;
        let c = col as usize;

        let mut game_state = match self.state.player_games.get(&wallet).await.unwrap_or(None) {
            Some(gs) => gs,
            None => {
                return ArenaResponse::Error(ErrorResponse {
                    message: "No game in progress".into(),
                });
            }
        };

        if game_state.completed {
            return ArenaResponse::Error(ErrorResponse { message: "Board already completed".into() });
        }
        if game_state.given_mask[r][c] {
            return ArenaResponse::Error(ErrorResponse { message: "Cannot clear a given cell".into() });
        }

        game_state.board[r][c] = 0;
        self.state.player_games.insert(&wallet, game_state)
            .expect("Failed to save game state");

        ArenaResponse::CellCleared(CellClearedResponse { row, col })
    }

    async fn handle_subscribe_to_hub(&mut self) -> ArenaResponse {
        let hub = self.hub_chain_id();
        let app_id = self.runtime.application_id().forget_abi();
        self.runtime.subscribe_to_events(
            hub, app_id, StreamName(TOURNAMENT_STREAM.to_vec()),
        );
        ArenaResponse::Subscribed(SubscribedResponse { hub_chain_id: hub })
    }

    async fn handle_request_leaderboard(&mut self, limit: Option<u32>) -> ArenaResponse {
        let hub = self.hub_chain_id();
        let requester_chain = self.runtime.chain_id();
        let limit = limit.unwrap_or(50).min(200);

        self.runtime
            .prepare_message(Message::LeaderboardRequest { requester_chain, limit })
            .with_authentication()
            .send_to(hub);

        ArenaResponse::LeaderboardRequested(LeaderboardRequestedResponse {
            message: "Leaderboard request sent to Hub. Query cachedLeaderboard shortly.".into(),
        })
    }

    async fn handle_start_tournament(&mut self, seed: u64, duration_secs: u64) -> ArenaResponse {
        self.assert_admin();

        if !self.is_hub() {
            return ArenaResponse::Error(ErrorResponse {
                message: "StartTournament can only be called on the Hub chain".into(),
            });
        }

        if let Some(t) = self.state.active_tournament.get() {
            if t.active {
                return ArenaResponse::Error(ErrorResponse {
                    message: "A tournament is already active. End it first.".into(),
                });
            }
        }

        let now = self.now_micros();
        let counter = *self.state.tournament_counter.get() + 1;
        self.state.tournament_counter.set(counter);

        let start_time = now;
        let end_time = now + (duration_secs * 1_000_000);

        let puzzle = sudoku::generate_puzzle(seed).expect("Failed to generate Sudoku puzzle");
        self.state.current_puzzle.set(Some(puzzle));

        let tournament = Tournament {
            id: counter, seed,
            start_time_micros: start_time,
            end_time_micros: end_time,
            active: true,
            total_players: 0,
            total_completions: 0,
        };
        self.state.active_tournament.set(Some(tournament));

        // Clear previous leaderboard
        self.state.leaderboard.clear();

        let event = ArenaEvent::TournamentStarted {
            tournament_id: counter, seed,
            start_time_micros: start_time,
            end_time_micros: end_time,
        };
        self.runtime.emit(StreamName(TOURNAMENT_STREAM.to_vec()), &event);

        self.state.event_log.push(event);
        let ec = *self.state.event_counter.get() + 1;
        self.state.event_counter.set(ec);

        ArenaResponse::TournamentStarted(TournamentStartedResponse {
            tournament_id: counter, seed,
            start_time_micros: start_time,
            end_time_micros: end_time,
        })
    }

    async fn handle_end_tournament(&mut self) -> ArenaResponse {
        self.assert_admin();

        if !self.is_hub() {
            return ArenaResponse::Error(ErrorResponse {
                message: "EndTournament can only be called on the Hub chain".into(),
            });
        }

        let mut tournament = match self.state.active_tournament.get().clone() {
            Some(t) if t.active => t,
            _ => {
                return ArenaResponse::Error(ErrorResponse {
                    message: "No active tournament to end".into(),
                });
            }
        };

        tournament.active = false;

        let final_rankings = self.state.get_sorted_leaderboard(200).await;
        let total_players = tournament.total_players;
        let total_completions = tournament.total_completions;
        let tournament_id = tournament.id;

        self.state.past_tournaments.push(tournament.clone());
        self.state.active_tournament.set(Some(tournament));

        let event = ArenaEvent::TournamentEnded {
            tournament_id,
            final_rankings: final_rankings.clone(),
        };
        self.runtime.emit(StreamName(TOURNAMENT_STREAM.to_vec()), &event);

        self.state.event_log.push(event);
        let ec = *self.state.event_counter.get() + 1;
        self.state.event_counter.set(ec);

        ArenaResponse::TournamentEnded(TournamentEndedResponse {
            tournament_id, total_players, total_completions,
        })
    }
}

// ---------------------------------------------------------------------------
// Message Handlers
// ---------------------------------------------------------------------------

impl FridayChainArenaContract {
    async fn handle_sync_player(&mut self, player_info: PlayerInfo) {
        let wallet = player_info.wallet;
        let is_new = !self.state.players.contains_key(&wallet).await.unwrap_or(false);

        self.state.players.insert(&wallet, player_info.clone())
            .expect("Failed to sync player");

        if is_new {
            let count = *self.state.player_count.get() + 1;
            self.state.player_count.set(count);

            let event = ArenaEvent::PlayerRegistered {
                wallet,
                discord_username: player_info.discord_username,
            };
            self.state.event_log.push(event);
            let ec = *self.state.event_counter.get() + 1;
            self.state.event_counter.set(ec);
        }
    }

    async fn handle_sync_cell_placement(
        &mut self,
        wallet: AccountOwner,
        _row: u8, _col: u8, _value: u8, timestamp_micros: u64,
        penalty_count: u32,
    ) {
        /// Minimum average seconds per move before a player is flagged.
        const SUSPICIOUS_PACE_SECS: u64 = 6;

        if let Some(mut tournament) = self.state.active_tournament.get().clone() {
            if tournament.active {
                // Compute estimated live score for in-progress players
                let elapsed_secs = timestamp_micros.saturating_sub(tournament.start_time_micros) / 1_000_000;
                let time_pen = elapsed_secs.saturating_mul(2);
                let move_pen = (penalty_count as u64).saturating_mul(100);
                let estimated_score = 10_000u64.saturating_sub(time_pen).saturating_sub(move_pen);

                let has_entry = self.state.leaderboard.contains_key(&wallet).await.unwrap_or(false);

                if !has_entry {
                    let username = self.state.players.get(&wallet).await
                        .unwrap_or(None)
                        .map(|p| p.discord_username.clone())
                        .unwrap_or_else(|| "Unknown".to_string());

                    let entry = LeaderboardEntry {
                        wallet,
                        discord_username: username,
                        score: estimated_score,
                        completion_time_micros: 0,
                        penalty_count,
                        move_count: 1,
                        completed: false,
                        first_move_time_micros: timestamp_micros,
                        last_move_time_micros: timestamp_micros,
                        is_suspicious: false,
                    };
                    self.state.leaderboard.insert(&wallet, entry)
                        .expect("Failed to create leaderboard entry");

                    tournament.total_players += 1;
                    self.state.active_tournament.set(Some(tournament));
                } else {
                    if let Some(mut entry) = self.state.leaderboard.get(&wallet).await.unwrap_or(None) {
                        if !entry.completed {
                            entry.move_count += 1;
                            entry.penalty_count = penalty_count;
                            entry.score = estimated_score;
                            entry.last_move_time_micros = timestamp_micros;

                            // Detect suspicious pace: avg interval between moves
                            if entry.move_count >= 5 && entry.first_move_time_micros > 0 {
                                let solve_secs = timestamp_micros
                                    .saturating_sub(entry.first_move_time_micros) / 1_000_000;
                                // N moves → N-1 intervals
                                let intervals = (entry.move_count - 1) as u64;
                                let avg_pace = if intervals > 0 { solve_secs / intervals } else { u64::MAX };
                                if avg_pace < SUSPICIOUS_PACE_SECS {
                                    entry.is_suspicious = true;
                                }
                            }

                            self.state.leaderboard.insert(&wallet, entry)
                                .expect("Failed to update leaderboard entry");
                        }
                    }
                }
            }
        }
    }

    async fn handle_sync_board_complete(
        &mut self,
        wallet: AccountOwner,
        completion_time_micros: u64,
        penalty_count: u32,
        move_count: u32,
    ) {
        /// Minimum average seconds per move before a player is flagged.
        const SUSPICIOUS_PACE_SECS: u64 = 6;

        let username = self.state.players.get(&wallet).await
            .unwrap_or(None)
            .map(|p| p.discord_username.clone())
            .unwrap_or_else(|| "Unknown".to_string());

        let tournament = match self.state.active_tournament.get().clone() {
            Some(t) => t,
            None => return,
        };

        let elapsed_secs = completion_time_micros.saturating_sub(tournament.start_time_micros) / 1_000_000;
        let time_penalty = elapsed_secs.saturating_mul(2);
        let move_pen = (penalty_count as u64).saturating_mul(100);
        let score = 10_000u64.saturating_sub(time_penalty).saturating_sub(move_pen);

        // Preserve first_move_time_micros and is_suspicious from the
        // in-progress entry (if one exists). Fall back to tournament start.
        let existing = self.state.leaderboard.get(&wallet).await.unwrap_or(None);
        let first_move = existing.as_ref()
            .map(|e| e.first_move_time_micros)
            .filter(|&t| t > 0)
            .unwrap_or(tournament.start_time_micros);
        let mut suspicious = existing.as_ref().map(|e| e.is_suspicious).unwrap_or(false);

        // Final suspicious check using actual solve time (first move → completion)
        if move_count >= 5 {
            let solve_secs = completion_time_micros.saturating_sub(first_move) / 1_000_000;
            let intervals = (move_count - 1) as u64;
            let avg_pace = if intervals > 0 { solve_secs / intervals } else { u64::MAX };
            if avg_pace < SUSPICIOUS_PACE_SECS {
                suspicious = true;
            }
        }

        let entry = LeaderboardEntry {
            wallet,
            discord_username: username,
            score,
            completion_time_micros,
            penalty_count,
            move_count,
            completed: true,
            first_move_time_micros: first_move,
            last_move_time_micros: completion_time_micros,
            is_suspicious: suspicious,
        };

        self.state.leaderboard.insert(&wallet, entry.clone())
            .expect("Failed to update leaderboard");
        self.state.leaderboard_log.push(entry);

        let mut tournament = tournament;
        tournament.total_completions += 1;
        self.state.active_tournament.set(Some(tournament));

        let entries = self.state.get_sorted_leaderboard(50).await;
        let event = ArenaEvent::LeaderboardUpdated { entries };
        self.runtime.emit(StreamName(TOURNAMENT_STREAM.to_vec()), &event);
    }

    async fn handle_leaderboard_request(&mut self, requester_chain: ChainId, limit: u32) {
        let entries = self.state.get_sorted_leaderboard(limit).await;

        let tournament_id = self.state.active_tournament.get()
            .as_ref().map(|t| t.id).unwrap_or(0);
        let is_active = self.state.active_tournament.get()
            .as_ref().map(|t| t.active).unwrap_or(false);

        self.runtime
            .prepare_message(Message::LeaderboardResponse { entries, tournament_id, is_active })
            .with_authentication()
            .send_to(requester_chain);
    }

    async fn handle_leaderboard_response(
        &mut self,
        entries: Vec<LeaderboardEntry>,
        tournament_id: u64,
        is_active: bool,
    ) {
        let now = self.now_micros();
        self.state.cached_leaderboard.set(Some(CachedLeaderboard {
            entries, tournament_id, is_active, fetched_at_micros: now,
        }));
    }

    async fn handle_tournament_started_msg(
        &mut self,
        tournament_id: u64, seed: u64,
        start_time_micros: u64, end_time_micros: u64,
    ) {
        let tournament = Tournament {
            id: tournament_id, seed,
            start_time_micros, end_time_micros,
            active: true,
            total_players: 0,
            total_completions: 0,
        };
        self.state.active_tournament.set(Some(tournament));

        let puzzle = sudoku::generate_puzzle(seed).expect("Failed to generate puzzle from seed");
        self.state.current_puzzle.set(Some(puzzle));

        // Clear previous game states
        self.state.player_games.clear();
        self.state.cached_leaderboard.set(None);
    }

    async fn handle_tournament_ended_msg(
        &mut self,
        tournament_id: u64,
        final_rankings: Vec<LeaderboardEntry>,
    ) {
        if let Some(mut t) = self.state.active_tournament.get().clone() {
            if t.id == tournament_id {
                t.active = false;
                self.state.active_tournament.set(Some(t));
            }
        }

        let now = self.now_micros();
        self.state.cached_leaderboard.set(Some(CachedLeaderboard {
            entries: final_rankings,
            tournament_id,
            is_active: false,
            fetched_at_micros: now,
        }));
    }
}

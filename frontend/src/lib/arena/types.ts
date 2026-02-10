// FridayChain Arena — TypeScript Types
//
// Mirrors the on-chain Rust types for the frontend.
// All state is read from chain queries — these types represent the shape of that data.

export interface PlayerInfo {
  wallet: string;
  discordUsername: string;
  registeredAtMicros: string; // u64 as string from GraphQL
}

export interface Tournament {
  id: string;
  seed: string;
  startTimeMicros: string;
  endTimeMicros: string;
  active: boolean;
  totalPlayers: number;
  totalCompletions: number;
}

export interface PlayerGameState {
  board: number[][];
  givenMask: boolean[][];
  penaltyCount: number;
  moveCount: number;
  startTimeMicros: string;
  completed: boolean;
  completionTimeMicros: string | null;
  score: string;
}

export interface LeaderboardEntry {
  wallet: string;
  discordUsername: string;
  score: string;
  completionTimeMicros: string;
  penaltyCount: number;
  moveCount: number;
  completed: boolean;
}

export interface CachedLeaderboard {
  entries: LeaderboardEntry[];
  tournamentId: string;
  isActive: boolean;
  fetchedAtMicros: string;
}

export interface TournamentStats {
  tournamentId: string;
  totalPlayers: number;
  totalCompletions: number;
  averageScore: string;
  bestScore: string;
  isActive: boolean;
}

export interface VerifyResult {
  valid: boolean;
  totalMoves: number;
  penaltyCount: number;
  finalScore: string;
  boardComplete: boolean;
}

// ── Response types from mutations ────────────────────────────────────────

export interface CellPlacedResponse {
  row: number;
  col: number;
  value: number;
  valid: boolean;
  penaltyCount: number;
  boardComplete: boolean;
}

export interface BoardCompletedResponse {
  completionTimeMicros: string;
  penaltyCount: number;
  score: string;
}

export interface ErrorResponse {
  message: string;
}

// ── Arena response union ─────────────────────────────────────────────────

export type ArenaResponse =
  | { __typename: 'PlayerRegisteredResponse'; wallet: string; discordUsername: string }
  | { __typename: 'UsernameUpdatedResponse'; wallet: string; newDiscordUsername: string }
  | { __typename: 'CellPlacedResponse' } & CellPlacedResponse
  | { __typename: 'CellClearedResponse'; row: number; col: number }
  | { __typename: 'BoardCompletedResponse' } & BoardCompletedResponse
  | { __typename: 'TournamentStartedResponse'; tournamentId: string; seed: string; startTimeMicros: string; endTimeMicros: string }
  | { __typename: 'TournamentEndedResponse'; tournamentId: string; totalPlayers: number; totalCompletions: number }
  | { __typename: 'LeaderboardRequestedResponse'; message: string }
  | { __typename: 'SubscribedResponse'; hubChainId: string }
  | { __typename: 'ErrorResponse' } & ErrorResponse;

// ── Connection state ─────────────────────────────────────────────────────

export enum ConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

export interface ConnectionState {
  status: ConnectionStatus;
  address: string | null;      // MetaMask EVM address (display identity)
  signerAddress: string | null; // On-chain signer address
  chainId: string | null;
  error: string | null;
}

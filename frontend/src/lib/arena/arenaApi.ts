// FridayChain Arena — Arena API
//
// High-level API that wraps the Linera client and GraphQL queries.
// All reads go through GraphQL queries to the chain.
// All writes go through GraphQL mutations that propose new blocks.

import * as linera from '../linera/lineraClient';
import * as queries from './queries';
import type {
  CachedLeaderboard,
  LeaderboardEntry,
  PlayerGameState,
  PlayerInfo,
  Tournament,
  TournamentStats,
} from './types';

// ── Player ───────────────────────────────────────────────────────────────

export async function registerPlayer(discordUsername: string): Promise<unknown> {
  return linera.mutate(queries.MUTATION_REGISTER_PLAYER, { discordUsername });
}

export async function updateUsername(newDiscordUsername: string): Promise<unknown> {
  return linera.mutate(queries.MUTATION_UPDATE_USERNAME, { newDiscordUsername });
}

export async function getPlayer(wallet: string): Promise<PlayerInfo | null> {
  const data = (await linera.query(queries.QUERY_PLAYER, { wallet })) as {
    player: PlayerInfo | null;
  };
  return data.player;
}

export async function getAllPlayers(): Promise<PlayerInfo[]> {
  const data = (await linera.query(queries.QUERY_ALL_PLAYERS)) as {
    allPlayers: PlayerInfo[];
  };
  return data.allPlayers || [];
}

export async function getPlayerCount(): Promise<number> {
  const data = (await linera.query(queries.QUERY_PLAYER_COUNT)) as {
    playerCount: number;
  };
  return data.playerCount || 0;
}

// ── Tournament (queries Hub chain — tournament data lives there) ─────────

export async function getActiveTournament(): Promise<Tournament | null> {
  const data = (await linera.queryHub(queries.QUERY_ACTIVE_TOURNAMENT)) as {
    activeTournament: Tournament | null;
  };
  return data.activeTournament;
}

export async function isTournamentActive(): Promise<boolean> {
  const data = (await linera.queryHub(queries.QUERY_IS_TOURNAMENT_ACTIVE)) as {
    isTournamentActive: boolean;
  };
  return data.isTournamentActive;
}

export async function getPuzzleBoard(): Promise<number[][] | null> {
  const data = (await linera.queryHub(queries.QUERY_PUZZLE_BOARD)) as {
    puzzleBoard: number[][] | null;
  };
  return data.puzzleBoard;
}

export async function getTournamentStats(): Promise<TournamentStats | null> {
  const data = (await linera.queryHub(queries.QUERY_TOURNAMENT_STATS)) as {
    tournamentStats: TournamentStats;
  };
  return data.tournamentStats;
}

export async function getPastTournaments(limit?: number): Promise<Tournament[]> {
  const data = (await linera.queryHub(queries.QUERY_PAST_TOURNAMENTS, {
    limit: limit || 10,
  })) as {
    pastTournaments: Tournament[];
  };
  return data.pastTournaments || [];
}

// ── Game State ───────────────────────────────────────────────────────────

export async function getPlayerGameState(
  wallet: string,
): Promise<PlayerGameState | null> {
  const data = (await linera.query(queries.QUERY_PLAYER_GAME_STATE, {
    wallet,
  })) as {
    playerGameState: PlayerGameState | null;
  };
  return data.playerGameState;
}

// ── Gameplay Mutations ───────────────────────────────────────────────────

export async function placeCell(
  row: number,
  col: number,
  value: number,
): Promise<unknown> {
  return linera.mutate(queries.MUTATION_PLACE_CELL, { row, col, value });
}

export async function clearCell(row: number, col: number): Promise<unknown> {
  return linera.mutate(queries.MUTATION_CLEAR_CELL, { row, col });
}

// ── Leaderboard (queries Hub chain) ──────────────────────────────────────

export async function getLeaderboard(limit?: number): Promise<LeaderboardEntry[]> {
  const data = (await linera.queryHub(queries.QUERY_LEADERBOARD, {
    limit: limit || 50,
  })) as {
    leaderboard: LeaderboardEntry[];
  };
  return data.leaderboard || [];
}

export async function getCachedLeaderboard(): Promise<CachedLeaderboard | null> {
  const data = (await linera.queryHub(queries.QUERY_CACHED_LEADERBOARD)) as {
    cachedLeaderboard: CachedLeaderboard | null;
  };
  return data.cachedLeaderboard;
}

export async function requestLeaderboard(limit?: number): Promise<unknown> {
  return linera.mutate(queries.MUTATION_REQUEST_LEADERBOARD, {
    limit: limit || 50,
  });
}

// ── Chain Operations ─────────────────────────────────────────────────────

export async function subscribeToHub(): Promise<unknown> {
  return linera.mutate(queries.MUTATION_SUBSCRIBE_TO_HUB);
}

// ── Events (queries Hub chain) ───────────────────────────────────────────

export async function getRecentEvents(limit?: number): Promise<string[]> {
  const data = (await linera.queryHub(queries.QUERY_RECENT_EVENTS, {
    limit: limit || 20,
  })) as {
    recentEvents: string[];
  };
  return data.recentEvents || [];
}

export async function getEventCount(): Promise<number> {
  const data = (await linera.queryHub(queries.QUERY_EVENT_COUNT)) as {
    eventCount: number;
  };
  return data.eventCount || 0;
}

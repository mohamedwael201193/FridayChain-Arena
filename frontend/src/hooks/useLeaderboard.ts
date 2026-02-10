// FridayChain Arena — Leaderboard Hook
//
// Queries the Hub chain directly for live leaderboard data.

import { useCallback, useEffect, useState } from 'react';
import * as arenaApi from '../lib/arena/arenaApi';
import type { LeaderboardEntry } from '../lib/arena/types';
import { useArena } from './useArena';

interface UseLeaderboardResult {
  entries: LeaderboardEntry[];
  tournamentId: string | null;
  isActive: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  lastFetched: Date | null;
}

export function useLeaderboard(limit = 50): UseLeaderboardResult {
  const { connection, tournament } = useArena();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (connection.status !== 'connected') return;
    // Only set loading on first fetch — subsequent fetches are silent
    const isFirstFetch = entries.length === 0;
    if (isFirstFetch) setLoading(true);

    try {
      // Query the Hub chain directly for live leaderboard — no cross-chain needed
      const leaderboardEntries = await arenaApi.getLeaderboard(limit);
      setEntries(leaderboardEntries);
      setLastFetched(new Date());

      if (tournament) {
        setTournamentId(tournament.id);
        setIsActive(tournament.active);
      }
    } catch (e) {
      console.warn('Failed to refresh leaderboard:', e);
    } finally {
      if (isFirstFetch) setLoading(false);
    }
  }, [connection.status, limit, tournament, entries.length]);

  // Auto-refresh on mount and every 5 seconds
  useEffect(() => {
    if (connection.status !== 'connected') return;

    refresh();
    const interval = setInterval(refresh, 5_000);
    return () => clearInterval(interval);
  }, [connection.status, refresh]);

  return { entries, tournamentId, isActive, loading, refresh, lastFetched };
}

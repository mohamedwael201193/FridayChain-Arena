// FridayChain Arena — Leaderboard Hook
//
// Queries the Hub chain directly for live leaderboard data.

import { useCallback, useEffect, useRef, useState } from 'react';
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

  // Ref-based flags to avoid re-creating refresh (and re-subscribing the interval) on every fetch
  const hasLoadedRef = useRef(false);
  const lastTournamentIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (connection.status !== 'connected') return;
    // Only show loading spinner on the very first fetch
    if (!hasLoadedRef.current) setLoading(true);

    try {
      // If tournament changed, clear stale entries before fetching fresh ones
      if (tournament?.id && lastTournamentIdRef.current && tournament.id !== lastTournamentIdRef.current) {
        setEntries([]);
        hasLoadedRef.current = false;
      }

      const leaderboardEntries = await arenaApi.getLeaderboard(limit);
      setEntries(leaderboardEntries);
      setLastFetched(new Date());

      if (tournament) {
        lastTournamentIdRef.current = tournament.id;
        setTournamentId(tournament.id);
        setIsActive(tournament.active);
      }
    } catch (e) {
      console.warn('Failed to refresh leaderboard:', e);
    } finally {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        setLoading(false);
      }
    }
  }, [connection.status, limit, tournament]);

  // Reset load flag on disconnect so first-fetch loading state works again on reconnect
  useEffect(() => {
    if (connection.status !== 'connected') {
      hasLoadedRef.current = false;
    }
  }, [connection.status]);

  // Auto-refresh on mount and every 3 seconds
  useEffect(() => {
    if (connection.status !== 'connected') return;

    refresh();
    const interval = setInterval(refresh, 3_000);
    return () => clearInterval(interval);
  }, [connection.status, refresh]);

  return { entries, tournamentId, isActive, loading, refresh, lastFetched };
}

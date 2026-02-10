// FridayChain Arena — Tournament Hook
//
// Manages tournament countdown and time-related state.

import { useEffect, useState } from 'react';
import { useArena } from './useArena';

interface UseTournamentResult {
  isActive: boolean;
  timeRemainingMs: number;
  timeRemainingSecs: number;
  timeRemainingFormatted: string;
  elapsedMs: number;
  progress: number; // 0-100
  startTime: Date | null;
  endTime: Date | null;
}

export function useTournament(): UseTournamentResult {
  const { tournament } = useArena();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!tournament || !tournament.active) {
    return {
      isActive: false,
      timeRemainingMs: 0,
      timeRemainingSecs: 0,
      timeRemainingFormatted: '00:00:00',
      elapsedMs: 0,
      progress: 0,
      startTime: null,
      endTime: null,
    };
  }

  const startMicros = parseInt(tournament.startTimeMicros);
  const endMicros = parseInt(tournament.endTimeMicros);
  const startMs = startMicros / 1000;
  const endMs = endMicros / 1000;
  const totalDurationMs = endMs - startMs;
  const elapsed = now - startMs;
  const remaining = Math.max(0, endMs - now);
  const progress = Math.min(100, (elapsed / totalDurationMs) * 100);

  return {
    isActive: remaining > 0,
    timeRemainingMs: remaining,
    timeRemainingSecs: Math.floor(remaining / 1000),
    timeRemainingFormatted: formatTime(remaining),
    elapsedMs: elapsed,
    progress,
    startTime: new Date(startMs),
    endTime: new Date(endMs),
  };
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');
}

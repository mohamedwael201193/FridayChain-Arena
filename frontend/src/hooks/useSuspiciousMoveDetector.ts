// FridayChain Arena — Suspicious Move Detector
//
// Client-side anti-cheat signal. Tracks move timestamps using a rolling
// window and flags the player when multiple moves happen in rapid succession
// (faster than any human can realistically click, read, and decide).
//
// This is a VISUAL indicator only — it never blocks moves or rejects txns.
// Once triggered, the red dot stays for the rest of the session (sticky flag).
//
// Also provides a static analysis function for leaderboard entries:
// flags any player whose average seconds-per-move is suspiciously low.

import { useCallback, useRef, useState } from 'react';

// ── Tuning Constants ─────────────────────────────────────────────────────

/** Number of consecutive fast moves required to trigger the flag. */
const BURST_THRESHOLD = 3;

/**
 * Maximum ms between two consecutive moves to count as "fast".
 * Must account for blockchain TX latency (~2-4s) + UI refresh.
 * A normal Sudoku player thinks 5-20s between moves.
 * If someone places 3+ moves each under 5s (including TX wait),
 * they're barely thinking — likely copying answers from AI.
 */
const FAST_MOVE_INTERVAL_MS = 5_000;

/**
 * For leaderboard analysis: minimum average seconds per move to be
 * considered normal. Below this = flagged as suspicious.
 * Blockchain TX takes ~2-4s, so absolute minimum is ~3s/move.
 * A human thinking + TX time = 8-30+ seconds per move.
 * Under 6s/move consistently (barely above TX latency) = suspicious.
 */
const MIN_AVG_SECS_PER_MOVE = 6;

// ── Hook ─────────────────────────────────────────────────────────────────

export interface SuspiciousMoveDetector {
  /** True when the current player is flagged for burst behavior. */
  isSuspicious: boolean;

  /** Call this every time the player places a cell (before or after the tx). */
  recordMove: () => void;

  /** Manually clear the flag (e.g., on disconnect or new tournament). */
  reset: () => void;
}

export function useSuspiciousMoveDetector(): SuspiciousMoveDetector {
  const [isSuspicious, setIsSuspicious] = useState(false);

  // Rolling window of the last N timestamps (ring buffer style).
  const moveTimestamps = useRef<number[]>([]);

  const recordMove = useCallback(() => {
    const now = Date.now();
    const ts = moveTimestamps.current;
    ts.push(now);

    // Keep only the last BURST_THRESHOLD entries — no unbounded growth.
    if (ts.length > BURST_THRESHOLD) {
      ts.shift();
    }

    // Need at least BURST_THRESHOLD moves to evaluate a burst.
    if (ts.length < BURST_THRESHOLD) return;

    // Check if ALL intervals between the last BURST_THRESHOLD moves are fast.
    let allFast = true;
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] - ts[i - 1] > FAST_MOVE_INTERVAL_MS) {
        allFast = false;
        break;
      }
    }

    if (allFast) {
      // Once flagged, stays flagged for the entire session (sticky).
      // Only reset() clears it (e.g., new tournament or disconnect).
      setIsSuspicious(true);
    }
  }, []);

  const reset = useCallback(() => {
    moveTimestamps.current = [];
    setIsSuspicious(false);
  }, []);

  return { isSuspicious, recordMove, reset };
}

// ── Leaderboard-level detection (static analysis) ────────────────────────



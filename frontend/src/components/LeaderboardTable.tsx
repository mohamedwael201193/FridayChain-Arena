// FridayChain Arena — Leaderboard Table Component

import { useEffect, useMemo, useState } from 'react';
import type { LeaderboardEntry } from '../lib/arena/types';
import {
  Crown,
  Medal,
  Award,
  Clock,
  CheckCircle2,
  Gamepad2,
  TrendingUp,
  AlertTriangle,
  TimerOff,
} from 'lucide-react';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  loading?: boolean;
  highlightWallet?: string | null;
  compact?: boolean;
  tournamentStartMicros?: string;
  tournamentEndMicros?: string;
}

const TOTAL_CELLS_TO_PLACE = 46;
const PROGRESS_BONUS_PER_CELL = 150;

/** Cap elapsed time at tournament end — scores should freeze when time expires */
function computeLiveBaseScore(entry: LeaderboardEntry, tournamentStartMicros: string, tournamentEndMicros?: string): number {
  if (entry.completed) return parseInt(entry.score);
  const startMicros = parseInt(tournamentStartMicros || '0');
  if (!startMicros) return parseInt(entry.score);
  const nowMicros = Date.now() * 1000;
  const endMicros = tournamentEndMicros ? parseInt(tournamentEndMicros) : Infinity;
  // Cap at end time so scores stop decreasing after tournament window expires
  const cappedNowMicros = Math.min(nowMicros, endMicros);
  const elapsedSecs = Math.floor((cappedNowMicros - startMicros) / 1_000_000);
  return Math.max(0, 10000 - (elapsedSecs * 2) - ((entry.penaltyCount || 0) * 100));
}

function computeArenaRating(entry: LeaderboardEntry, tournamentStartMicros: string, tournamentEndMicros?: string): number {
  const baseScore = computeLiveBaseScore(entry, tournamentStartMicros, tournamentEndMicros);
  // Completed players get the full 46-cell progress bonus (they solved every cell)
  if (entry.completed) return baseScore + TOTAL_CELLS_TO_PLACE * PROGRESS_BONUS_PER_CELL;
  const correctMoves = Math.max(0, entry.moveCount - (entry.penaltyCount || 0));
  return baseScore + correctMoves * PROGRESS_BONUS_PER_CELL;
}

export default function LeaderboardTable({
  entries,
  loading = false,
  highlightWallet = null,
  compact = false,
  tournamentStartMicros,
  tournamentEndMicros,
}: LeaderboardTableProps) {
  const [tick, setTick] = useState(0);
  const timeExpired = tournamentEndMicros
    ? Date.now() * 1000 > parseInt(tournamentEndMicros)
    : false;
  useEffect(() => {
    if (!tournamentStartMicros) return;
    const hasInProgress = entries.some(e => !e.completed);
    if (!hasInProgress) return;
    const interval = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(interval);
  }, [tournamentStartMicros, entries]);

  const liveEntries = useMemo(() => {
    if (!tournamentStartMicros || entries.length === 0) return entries;
    const withLive = entries.map(e => {
      const correctMoves = Math.max(0, e.moveCount - (e.penaltyCount || 0));
      return {
        ...e,
        liveBaseScore: computeLiveBaseScore(e, tournamentStartMicros, tournamentEndMicros),
        arenaRating: computeArenaRating(e, tournamentStartMicros, tournamentEndMicros),
        correctMoves,
      };
    });
    withLive.sort((a, b) => {
      if (a.completed && !b.completed) return -1;
      if (!a.completed && b.completed) return 1;
      return b.arenaRating - a.arenaRating;
    });
    return withLive;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, tournamentStartMicros, tick]);

  if (loading && entries.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-10 h-10 border-2 border-arena-primary/40 border-t-arena-primary rounded-full animate-spin mx-auto" />
        <p className="text-arena-text-dim text-sm mt-4">Loading leaderboard...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <Gamepad2 className="w-10 h-10 text-arena-text-dim mx-auto mb-3" />
        <p className="text-arena-text-muted font-medium">No entries yet</p>
        <p className="text-arena-text-dim text-sm mt-1">Be the first to start solving!</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-arena-border/50">
            <th className="py-3.5 px-3 text-left text-xs font-medium text-arena-text-dim uppercase tracking-wider w-12">#</th>
            <th className="py-3.5 px-3 text-left text-xs font-medium text-arena-text-dim uppercase tracking-wider">Player</th>
            <th className="py-3.5 px-3 text-right text-xs font-medium text-arena-text-dim uppercase tracking-wider">Rating</th>
            {!compact && (
              <>
                <th className="py-3.5 px-3 text-right text-xs font-medium text-arena-text-dim uppercase tracking-wider">Time</th>
                <th className="py-3.5 px-3 text-center text-xs font-medium text-arena-text-dim uppercase tracking-wider">Progress</th>
                <th className="py-3.5 px-3 text-right text-xs font-medium text-arena-text-dim uppercase tracking-wider">Moves</th>
                <th className="py-3.5 px-3 text-right text-xs font-medium text-arena-text-dim uppercase tracking-wider">Penalties</th>
                <th className="py-3.5 px-3 text-center text-xs font-medium text-arena-text-dim uppercase tracking-wider">Status</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {liveEntries.map((entry, index) => {
            const isHighlighted =
              highlightWallet &&
              entry.wallet.toLowerCase() === highlightWallet.toLowerCase();
            const rank = index + 1;
            const displayRating = 'arenaRating' in entry ? (entry as any).arenaRating : parseInt(entry.score);
            const correctMoves = 'correctMoves' in entry ? (entry as any).correctMoves : Math.max(0, entry.moveCount - (entry.penaltyCount || 0));
            const progressPct = entry.completed ? 100 : Math.round((correctMoves / TOTAL_CELLS_TO_PLACE) * 100);

            return (
              <tr
                key={entry.wallet}
                className={`border-b border-arena-border/20 transition-all duration-200 ${
                  isHighlighted
                    ? 'bg-arena-primary/8 border-l-2 border-l-arena-primary'
                    : 'hover:bg-arena-card/30'
                } ${rank <= 3 ? 'animate-slide-up' : ''}`}
                style={rank <= 5 ? { animationDelay: `${rank * 0.05}s` } : undefined}
              >
                {/* Rank */}
                <td className="py-3.5 px-3">
                  <RankBadge rank={rank} />
                </td>

                {/* Player */}
                <td className="py-3.5 px-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      rank === 1 ? 'bg-arena-accent/10 text-arena-accent' :
                      rank === 2 ? 'bg-slate-400/10 text-slate-400' :
                      rank === 3 ? 'bg-amber-700/10 text-amber-600' :
                      'bg-arena-card text-arena-text-dim'
                    }`}>
                      {entry.discordUsername.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className={`font-medium truncate max-w-[140px] ${isHighlighted ? 'text-arena-primary' : ''}`}>
                        {entry.discordUsername}
                        {isHighlighted && <span className="text-[10px] text-arena-primary/60 ml-1">(you)</span>}
                      </p>
                      {!compact && (
                        <p className="text-[10px] text-arena-text-dim font-mono truncate max-w-[140px]">
                          {entry.wallet.slice(0, 10)}...
                        </p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Rating */}
                <td className="py-3.5 px-3 text-right">
                  <div>
                    <span className={`font-mono font-bold text-base ${
                      rank === 1 ? 'text-arena-accent' :
                      rank <= 3 ? 'text-arena-primary' :
                      'text-arena-text'
                    }`}>
                      {displayRating.toLocaleString()}
                    </span>
                    {(entry.completed || correctMoves > 0) && (
                      <div className="flex items-center justify-end gap-0.5 text-[10px] text-arena-success">
                        <TrendingUp className="w-2.5 h-2.5" />
                        +{((entry.completed ? TOTAL_CELLS_TO_PLACE : correctMoves) * PROGRESS_BONUS_PER_CELL).toLocaleString()}
                      </div>
                    )}
                  </div>
                </td>

                {!compact && (
                  <>
                    {/* Time */}
                    <td className="py-3.5 px-3 text-right">
                      <span className="text-arena-text-muted font-mono text-xs">
                        {entry.completed ? (
                          <span className="flex items-center justify-end gap-1">
                            <Clock className="w-3 h-3 text-arena-text-dim" />
                            {formatElapsed(entry.completionTimeMicros, tournamentStartMicros)}
                          </span>
                        ) : (
                          <span className="text-arena-text-dim">--</span>
                        )}
                      </span>
                    </td>

                    {/* Progress */}
                    <td className="py-3.5 px-3">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-[11px] font-mono text-arena-text-muted">
                          {entry.completed ? TOTAL_CELLS_TO_PLACE : correctMoves}/{TOTAL_CELLS_TO_PLACE}
                        </span>
                        <div className="w-16 h-1.5 bg-arena-bg rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              entry.completed
                                ? 'bg-gradient-to-r from-arena-success to-emerald-400'
                                : 'bg-gradient-to-r from-arena-primary to-arena-blue'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Moves */}
                    <td className="py-3.5 px-3 text-right">
                      <span className="text-arena-text-muted font-mono">{entry.moveCount}</span>
                    </td>

                    {/* Penalties */}
                    <td className="py-3.5 px-3 text-right">
                      <span className={`inline-flex items-center gap-0.5 font-mono ${
                        entry.penaltyCount > 0 ? 'text-arena-error' : 'text-arena-success'
                      }`}>
                        {entry.penaltyCount > 0 && <AlertTriangle className="w-3 h-3" />}
                        {entry.penaltyCount}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-3 text-center">
                      {entry.completed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-arena-success/10 text-arena-success border border-arena-success/20">
                          <CheckCircle2 className="w-3 h-3" />
                          Solved
                        </span>
                      ) : timeExpired ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-arena-error/10 text-arena-error border border-arena-error/20">
                          <TimerOff className="w-3 h-3" />
                          Time Up
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-arena-accent/10 text-arena-accent border border-arena-accent/20">
                          <Gamepad2 className="w-3 h-3" />
                          Playing
                        </span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="rank-badge rank-badge-1" title="1st Place">
        <Crown className="w-3.5 h-3.5" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="rank-badge rank-badge-2" title="2nd Place">
        <Medal className="w-3.5 h-3.5" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="rank-badge rank-badge-3" title="3rd Place">
        <Award className="w-3.5 h-3.5" />
      </div>
    );
  }
  return (
    <span className="rank-badge bg-arena-bg border border-arena-border/50 text-arena-text-dim">
      {rank}
    </span>
  );
}

function formatElapsed(completionTimeMicros: string, tournamentStartMicros?: string): string {
  const completionMicros = parseInt(completionTimeMicros);
  const startMicros = parseInt(tournamentStartMicros || '0');
  if (!startMicros || !completionMicros) return '--';
  const elapsedSecs = Math.floor((completionMicros - startMicros) / 1_000_000);
  if (elapsedSecs < 0) return '--';
  const mins = Math.floor(elapsedSecs / 60);
  const secs = elapsedSecs % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

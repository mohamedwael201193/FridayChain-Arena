// FridayChain Arena — Game Play Page
//
// The main Sudoku gameplay screen.
// Reads puzzle and game state from chain, sends cell placements as mutations.

import { useState, useMemo, useEffect } from 'react';
import { useArena } from '../hooks/useArena';
import { useTournament } from '../hooks/useTournament';
import { useLeaderboard } from '../hooks/useLeaderboard';
import SudokuGrid from '../components/SudokuGrid';
import CountdownTimer from '../components/CountdownTimer';
import { ConnectionStatus } from '../lib/arena/types';
import {
  Wallet,
  UserPlus,
  Clock,
  Gamepad2,
  AlertTriangle,
  Grid3X3,
  Trophy,
  TrendingUp,
  Zap,
  CheckCircle2,
  Crown,
  Medal,
  Award,
  X,
  Hash,
  Users,
  Target,
  Sparkles,
} from 'lucide-react';

export default function GamePlayPage() {
  const {
    connection,
    connect,
    player,
    registerPlayer,
    tournament,
    puzzleBoard,
    gameState,
    placeCell,
    clearCell,
    loading,
    error,
    clearError,
  } = useArena();
  const { isActive, timeRemainingFormatted, timeRemainingSecs } = useTournament();
  const { entries: leaderboardEntries } = useLeaderboard(10);

  const [registrationName, setRegistrationName] = useState('');

  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(interval);
  }, []);

  const TOTAL_CELLS_TO_PLACE = 46;
  const PROGRESS_BONUS_PER_CELL = 150;

  const computeLiveBaseScore = (entry: typeof leaderboardEntries[0]) => {
    if (entry.completed) return parseInt(entry.score);
    const startMicros = parseInt(tournament?.startTimeMicros || '0');
    if (!startMicros) return parseInt(entry.score);
    const nowMicros = Date.now() * 1000;
    const endMicros = parseInt(tournament?.endTimeMicros || '0');
    // Cap at end time so scores freeze when tournament window expires
    const cappedNowMicros = endMicros > 0 ? Math.min(nowMicros, endMicros) : nowMicros;
    const elapsedSecs = Math.floor((cappedNowMicros - startMicros) / 1_000_000);
    return Math.max(0, 10000 - (elapsedSecs * 2) - ((entry.penaltyCount || 0) * 100));
  };

  const computeArenaRating = (entry: typeof leaderboardEntries[0]) => {
    const baseScore = computeLiveBaseScore(entry);
    if (entry.completed) return baseScore;
    const correctMoves = Math.max(0, entry.moveCount - (entry.penaltyCount || 0));
    return baseScore + (correctMoves * PROGRESS_BONUS_PER_CELL);
  };

  const sortedLeaderboard = useMemo(() => {
    return [...leaderboardEntries].sort((a, b) => computeArenaRating(b) - computeArenaRating(a));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardEntries, tournament?.startTimeMicros]);

  const estimatedRating = useMemo(() => {
    if (!gameState || !tournament) return null;
    const tournamentStartMicros = parseInt(tournament.startTimeMicros || '0');
    if (!tournamentStartMicros) return null;
    const nowMicros = Date.now() * 1000;
    const endMicros = parseInt(tournament.endTimeMicros || '0');
    // Cap at end time so your rating freezes when time expires
    const cappedNowMicros = endMicros > 0 ? Math.min(nowMicros, endMicros) : nowMicros;
    const elapsedSecs = Math.floor((cappedNowMicros - tournamentStartMicros) / 1_000_000);
    const timePenalty = elapsedSecs * 2;
    const movePenalty = (gameState.penaltyCount || 0) * 100;
    const baseScore = Math.max(0, 10000 - timePenalty - movePenalty);
    const correctMoves = Math.max(0, (gameState.moveCount || 0) - (gameState.penaltyCount || 0));
    const progressBonus = gameState.completed ? 0 : correctMoves * PROGRESS_BONUS_PER_CELL;
    return baseScore + progressBonus;
  }, [gameState, tournament, timeRemainingSecs]);

  // ── Not connected ──────────────────────────────────────────────────

  if (connection.status !== ConnectionStatus.Connected) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 animate-fade-in">
        <div className="glass-card rounded-2xl p-10">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-arena-primary/20 to-arena-primary/5 flex items-center justify-center border border-arena-primary/20 mb-6">
            <Wallet className="w-8 h-8 text-arena-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-3">Connect to Play</h1>
          <p className="text-arena-text-muted mb-8 leading-relaxed">
            Connect your MetaMask wallet to join the tournament and compete on Linera microchains
          </p>
          <button
            onClick={connect}
            disabled={connection.status === ConnectionStatus.Connecting}
            className="btn-glow px-8 py-3.5 rounded-xl text-white font-semibold text-lg transition-all disabled:opacity-50"
          >
            {connection.status === ConnectionStatus.Connecting
              ? 'Connecting...'
              : 'Connect MetaMask'}
          </button>
          {connection.error && (
            <p className="mt-4 text-arena-error text-sm">{connection.error}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Not registered ─────────────────────────────────────────────────

  if (!player) {
    return (
      <div className="max-w-md mx-auto text-center py-20 animate-fade-in">
        <div className="glass-card rounded-2xl p-10">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-arena-accent/20 to-arena-accent/5 flex items-center justify-center border border-arena-accent/20 mb-6">
            <UserPlus className="w-8 h-8 text-arena-accent" />
          </div>
          <h1 className="text-3xl font-bold mb-3">Register to Play</h1>
          <p className="text-arena-text-muted mb-6 leading-relaxed">
            Enter your Discord username to register on-chain
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={registrationName}
              onChange={(e) => setRegistrationName(e.target.value)}
              placeholder="YourDiscordName"
              maxLength={32}
              className="flex-1 px-4 py-3 rounded-xl bg-arena-bg/50 border border-arena-border/50 text-arena-text placeholder:text-arena-text-dim focus:outline-none focus:border-arena-primary/50 transition-colors"
            />
            <button
              onClick={() => registerPlayer(registrationName)}
              disabled={loading || !registrationName.trim()}
              className="btn-glow px-6 py-3 rounded-xl text-white font-semibold transition-colors disabled:opacity-50"
            >
              {loading ? 'Registering...' : 'Register'}
            </button>
          </div>
          {error && <p className="mt-4 text-arena-error text-sm">{error}</p>}
          <p className="mt-5 text-[11px] text-arena-text-dim">
            Your username will be permanently linked to your MetaMask address on the blockchain.
          </p>
        </div>
      </div>
    );
  }

  // ── No active tournament ───────────────────────────────────────────
  // Only check on-chain state — the contract is the source of truth.
  // The frontend timer expiring does NOT mean the tournament ended.

  if (!tournament || !tournament.active) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 animate-fade-in">
        <div className="glass-card rounded-2xl p-10">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-arena-text-dim/20 to-arena-text-dim/5 flex items-center justify-center border border-arena-border/30 mb-6">
            <Clock className="w-8 h-8 text-arena-text-dim" />
          </div>
          <h1 className="text-3xl font-bold mb-3">No Active Tournament</h1>
          <p className="text-arena-text-muted mb-8">
            The next tournament will be on Friday. Stay tuned!
          </p>
          <div className="glass-card rounded-xl p-6">
            <CountdownTimer />
          </div>
        </div>
      </div>
    );
  }

  // ── Board completed ────────────────────────────────────────────────

  if (gameState?.completed) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        {/* Confetti-like header */}
        <div className="text-center mb-8 relative">
          <Sparkles className="absolute -left-4 top-0 w-8 h-8 text-arena-accent/30 animate-float" />
          <Sparkles className="absolute -right-4 top-4 w-6 h-6 text-arena-primary/30 animate-float" style={{ animationDelay: '1s' }} />
          <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-arena-success/20 to-arena-success/5 flex items-center justify-center border border-arena-success/30 mb-4">
            <CheckCircle2 className="w-10 h-10 text-arena-success" />
          </div>
          <h1 className="text-4xl font-bold text-arena-success mb-2">
            Puzzle Completed!
          </h1>
          <p className="text-arena-text-muted">
            Your score has been recorded on-chain
          </p>
        </div>

        {/* Score card */}
        <div className="glass-card rounded-2xl p-8 mb-8 glow-outline text-center">
          <p className="text-sm text-arena-text-muted mb-3 flex items-center justify-center gap-1.5">
            <Trophy className="w-4 h-4 text-arena-accent" />
            Your Final Score
          </p>
          <p className="text-6xl font-extrabold text-arena-accent font-mono animate-scale-in">
            {parseInt(gameState.score).toLocaleString()}
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Grid3X3 className="w-4 h-4 text-arena-primary" />
                <p className="text-2xl font-bold">{gameState.moveCount}</p>
              </div>
              <p className="text-[11px] text-arena-text-dim">Moves</p>
            </div>
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <AlertTriangle className="w-4 h-4 text-arena-error" />
                <p className="text-2xl font-bold text-arena-error">
                  {gameState.penaltyCount}
                </p>
              </div>
              <p className="text-[11px] text-arena-text-dim">
                Penalties ({-gameState.penaltyCount * 100} pts)
              </p>
            </div>
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Clock className="w-4 h-4 text-arena-primary" />
                <p className="text-2xl font-bold text-arena-primary">
                  {timeRemainingFormatted}
                </p>
              </div>
              <p className="text-[11px] text-arena-text-dim">Remaining</p>
            </div>
          </div>
        </div>

        {/* Completed grid */}
        <SudokuGrid
          puzzleBoard={puzzleBoard!}
          playerBoard={gameState.board}
          givenMask={gameState.givenMask}
          completed={true}
        />
      </div>
    );
  }

  // ── Active game ────────────────────────────────────────────────────

  const displayBoard = gameState?.board;
  const givenMask = gameState?.givenMask;

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-arena-primary/20 to-arena-primary/5 flex items-center justify-center border border-arena-primary/20">
            <Gamepad2 className="w-5 h-5 text-arena-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              Tournament #{tournament.id}
            </h1>
            <p className="text-sm text-arena-text-muted">
              Playing as{' '}
              <span className="text-arena-primary font-semibold">
                {player.discordUsername}
              </span>
            </p>
          </div>
        </div>

        <CountdownTimer compact />
      </div>

      {/* Time expired notice */}
      {!isActive && tournament?.active && (
        <div className="mb-4 p-3.5 rounded-xl bg-arena-error/10 border border-arena-error/20 text-arena-error text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Tournament time has expired. No more moves can be submitted. Your score is now final.</span>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="mb-4 p-3.5 rounded-xl bg-arena-error/10 border border-arena-error/20 text-arena-error text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <button onClick={clearError} className="ml-2 hover:text-white p-1 rounded-lg hover:bg-arena-error/20 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Game area */}
      <div className="grid md:grid-cols-[1fr_280px] gap-8">
        {/* Sudoku Grid */}
        <div>
          {puzzleBoard ? (
            <SudokuGrid
              puzzleBoard={puzzleBoard}
              playerBoard={displayBoard || undefined}
              givenMask={givenMask || undefined}
              onCellPlace={isActive ? placeCell : undefined}
              onCellClear={isActive ? clearCell : undefined}
              completed={!isActive}
            />
          ) : (
            <div className="text-center py-16 glass-card rounded-2xl">
              <div className="w-10 h-10 border-2 border-arena-primary/40 border-t-arena-primary rounded-full animate-spin mx-auto" />
              <p className="text-arena-text-muted mt-4">Loading puzzle...</p>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* Stats */}
          <div className="glass-card rounded-xl p-4">
            <h3 className="text-xs font-semibold text-arena-text-dim uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              Game Stats
            </h3>
            <div className="space-y-2.5">
              <StatRow
                icon={<Grid3X3 className="w-3.5 h-3.5 text-arena-text-dim" />}
                label="Moves"
                value={String(gameState?.moveCount || 0)}
              />
              <StatRow
                icon={<AlertTriangle className="w-3.5 h-3.5 text-arena-text-dim" />}
                label="Penalties"
                value={String(gameState?.penaltyCount || 0)}
                color={
                  (gameState?.penaltyCount || 0) > 0
                    ? 'text-arena-error'
                    : 'text-arena-success'
                }
              />
              <StatRow
                icon={<Hash className="w-3.5 h-3.5 text-arena-text-dim" />}
                label="Cells Filled"
                value={`${countFilled(displayBoard)}/81`}
              />
            </div>
          </div>

          {/* Tournament info */}
          <div className="glass-card rounded-xl p-4">
            <h3 className="text-xs font-semibold text-arena-text-dim uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              Tournament
            </h3>
            <div className="space-y-2.5">
              <StatRow icon={<Users className="w-3.5 h-3.5 text-arena-text-dim" />} label="Players" value={String(tournament.totalPlayers)} />
              <StatRow
                icon={<CheckCircle2 className="w-3.5 h-3.5 text-arena-text-dim" />}
                label="Completions"
                value={String(tournament.totalCompletions)}
                color="text-arena-success"
              />
              <StatRow icon={<Hash className="w-3.5 h-3.5 text-arena-text-dim" />} label="Seed" value={tournament.seed} mono />
            </div>
          </div>

          {/* Live Arena Rating Estimate */}
          {estimatedRating !== null && (
            <div className="glass-card rounded-xl p-4 glow-outline">
              <h3 className="text-xs font-semibold text-arena-text-dim uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-arena-accent" />
                Your Rating
              </h3>
              <p className="text-3xl font-extrabold text-arena-accent font-mono text-center py-1">
                {estimatedRating.toLocaleString()}
              </p>
              <p className="text-[10px] text-arena-text-dim text-center mt-1">
                {gameState?.completed ? 'Final Score' : 'Includes progress bonus'}
              </p>
            </div>
          )}

          {/* Mini Leaderboard */}
          {sortedLeaderboard.length > 0 && (
            <div className="glass-card rounded-xl p-4">
              <h3 className="text-xs font-semibold text-arena-text-dim uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                Live Leaderboard
              </h3>
              <div className="space-y-2">
                {sortedLeaderboard.slice(0, 5).map((entry, i) => {
                  const isYou = connection.signerAddress && 
                    entry.wallet.toLowerCase().includes(connection.signerAddress.toLowerCase().replace('0x', ''));
                  const RankIcon = i === 0 ? Crown : i === 1 ? Medal : i === 2 ? Award : null;
                  return (
                    <div key={entry.wallet} className={`flex justify-between items-center text-xs px-2 py-1.5 rounded-lg transition-colors ${
                      isYou ? 'bg-arena-primary/10 text-arena-primary font-bold' : 'text-arena-text-muted hover:bg-arena-card/30'
                    }`}>
                      <span className="flex items-center gap-1.5 truncate max-w-[120px]">
                        {RankIcon ? (
                          <RankIcon className={`w-3 h-3 flex-shrink-0 ${
                            i === 0 ? 'text-arena-accent' : i === 1 ? 'text-slate-400' : 'text-amber-600'
                          }`} />
                        ) : (
                          <span className="w-3 text-center font-mono text-arena-text-dim">{i + 1}</span>
                        )}
                        {entry.discordUsername}{isYou ? ' (you)' : ''}
                      </span>
                      <span className="font-mono text-[11px]">
                        {computeArenaRating(entry).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scoring info */}
          <div className="glass-card rounded-xl p-3.5 text-[11px] text-arena-text-dim">
            <p className="font-semibold text-arena-text-muted mb-1.5 flex items-center gap-1">
              <Zap className="w-3 h-3 text-arena-primary" />
              Arena Rating
            </p>
            <div className="space-y-0.5">
              <p>Base: 10,000 pts</p>
              <p>Time: -2 pts/sec</p>
              <p>Penalty: -100 pts each</p>
              <p className="text-arena-success">Progress: +150 pts/cell</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
  color = 'text-arena-text',
  mono = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-arena-text-muted flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        className={`text-sm font-semibold ${color} ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function countFilled(board?: number[][]): number {
  if (!board) return 0;
  let count = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell !== 0) count++;
    }
  }
  return count;
}

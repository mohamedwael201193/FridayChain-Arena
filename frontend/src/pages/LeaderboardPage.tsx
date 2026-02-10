// FridayChain Arena — Leaderboard Page

import { useLeaderboard } from '../hooks/useLeaderboard';
import { useArena } from '../hooks/useArena';
import { useTournament } from '../hooks/useTournament';
import LeaderboardTable from '../components/LeaderboardTable';
import CountdownTimer from '../components/CountdownTimer';
import { ConnectionStatus } from '../lib/arena/types';
import {
  Trophy,
  RefreshCw,
  Zap,
  Clock,
  Target,
  AlertTriangle,
  TrendingUp,
  Radio,
  Link2,
} from 'lucide-react';

export default function LeaderboardPage() {
  const { connection, tournament } = useArena();
  const { isActive } = useTournament();
  const { entries, tournamentId, loading, refresh, lastFetched } =
    useLeaderboard(100);

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Hero Header */}
      <div className="relative glass-card rounded-2xl p-8 mb-8 overflow-hidden">
        {/* Decorative background icon */}
        <Trophy className="absolute -right-6 -top-6 w-40 h-40 text-arena-primary/[0.04]" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-arena-accent/20 to-arena-accent/5 flex items-center justify-center border border-arena-accent/20">
                <Trophy className="w-5 h-5 text-arena-accent" />
              </div>
              <h1 className="text-3xl font-bold text-shimmer">Leaderboard</h1>
            </div>
            {tournamentId && (
              <div className="flex items-center gap-3 ml-[52px]">
                <span className="text-sm text-arena-text-muted font-mono">
                  Tournament #{tournamentId}
                </span>
                {isActive && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-arena-success/10 border border-arena-success/20 text-xs text-arena-success">
                    <Radio className="w-3 h-3 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isActive && <CountdownTimer compact className="text-lg" />}
            {connection.status === ConnectionStatus.Connected && (
              <button
                onClick={refresh}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-xl border border-arena-border/50 text-sm text-arena-text-muted hover:text-arena-text hover:border-arena-primary/50 hover:bg-arena-primary/5 transition-all duration-200"
              >
                <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
                Refresh
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Not connected notice */}
      {connection.status !== ConnectionStatus.Connected && (
        <div className="mb-6 glass-card rounded-xl p-5 text-center">
          <div className="flex items-center justify-center gap-2 text-arena-text-muted text-sm">
            <Link2 className="w-4 h-4" />
            Connect your wallet to view the live leaderboard via cross-chain queries
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <LeaderboardTable
          entries={entries}
          loading={loading}
          highlightWallet={connection.signerAddress}
          tournamentStartMicros={tournament?.startTimeMicros}
          tournamentEndMicros={tournament?.endTimeMicros}
        />
      </div>

      {/* Last fetched info */}
      {lastFetched && (
        <p className="text-[11px] text-arena-text-dim mt-3 text-right font-mono flex items-center justify-end gap-1.5">
          <Clock className="w-3 h-3" />
          {lastFetched.toLocaleTimeString()} — live from Hub chain
        </p>
      )}

      {/* Arena Rating System */}
      <div className="mt-8 glass-card rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-arena-primary/20 to-arena-primary/5 flex items-center justify-center border border-arena-primary/20">
            <Zap className="w-4 h-4 text-arena-primary" />
          </div>
          <h2 className="text-lg font-bold">Arena Rating System</h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ScoringCard
            icon={<Target className="w-4 h-4" />}
            title="Base Score"
            value="10,000"
            description="Starting points for every player"
            color="accent"
          />
          <ScoringCard
            icon={<Clock className="w-4 h-4" />}
            title="Time Penalty"
            value="-2 / sec"
            description="Deducted per second solving"
            color="error"
          />
          <ScoringCard
            icon={<AlertTriangle className="w-4 h-4" />}
            title="Move Penalty"
            value="-100 / err"
            description="Deducted per invalid placement"
            color="warning"
          />
          <ScoringCard
            icon={<TrendingUp className="w-4 h-4" />}
            title="Progress Bonus"
            value="+150 / cell"
            description="Earned per correct cell placed"
            color="success"
          />
        </div>

        <p className="mt-5 text-xs text-arena-text-dim leading-relaxed">
          Active players earn progress bonuses that reward solving over idling.
          Final scores are computed deterministically on-chain and are publicly verifiable.
        </p>
      </div>
    </div>
  );
}

function ScoringCard({
  icon,
  title,
  value,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  description: string;
  color: 'accent' | 'error' | 'warning' | 'success';
}) {
  const colorMap = {
    accent: 'text-arena-accent border-arena-accent/20 bg-arena-accent/5',
    error: 'text-arena-error border-arena-error/20 bg-arena-error/5',
    warning: 'text-arena-warning border-arena-warning/20 bg-arena-warning/5',
    success: 'text-arena-success border-arena-success/20 bg-arena-success/5',
  };
  const iconBg = {
    accent: 'bg-arena-accent/10',
    error: 'bg-arena-error/10',
    warning: 'bg-arena-warning/10',
    success: 'bg-arena-success/10',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]} transition-transform duration-200 hover:scale-[1.02]`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconBg[color]}`}>
          {icon}
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-xl font-bold font-mono mb-1">{value}</p>
      <p className="text-[11px] text-arena-text-dim">{description}</p>
    </div>
  );
}

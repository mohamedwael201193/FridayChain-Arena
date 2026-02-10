// FridayChain Arena — Home Page

import { Link } from 'react-router-dom';
import { useArena } from '../hooks/useArena';
import { useTournament } from '../hooks/useTournament';
import CountdownTimer from '../components/CountdownTimer';
import HowToPlay from '../components/HowToPlay';
import { ConnectionStatus } from '../lib/arena/types';
import {
  Link2,
  Trophy,
  ShieldCheck,
  Zap,
  Users,
  CheckCircle2,
  Blocks,
  ChevronRight,
  Sparkles,
  Grid3X3,
  Timer,
  Brain,
} from 'lucide-react';

export default function HomePage() {
  const { connection, tournament } = useArena();
  const { isActive } = useTournament();

  return (
    <div className="space-y-16 animate-fade-in">
      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative text-center py-16 md:py-24 overflow-hidden">
        {/* Decorative floating grid icon */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 opacity-[0.04] pointer-events-none">
          <Grid3X3 className="w-[400px] h-[400px]" strokeWidth={0.5} />
        </div>

        <div className="relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-card mb-6 animate-slide-up text-xs text-arena-text-muted">
            <Blocks className="w-3.5 h-3.5 text-arena-primary" />
            <span>Powered by Linera Microchains</span>
            <span className="w-1.5 h-1.5 rounded-full bg-arena-success animate-pulse" />
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] animate-slide-up stagger-1">
            <span className="text-shimmer">Competitive Sudoku</span>
            <br />
            <span className="text-arena-text">On-Chain</span>
          </h1>

          <p className="mt-6 text-lg md:text-xl text-arena-text-muted max-w-2xl mx-auto leading-relaxed animate-slide-up stagger-2">
            Every move is a blockchain transaction on your personal Linera microchain.
            Every score is computed by smart contracts. <span className="text-arena-primary font-medium">No cheating possible.</span>
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-wrap justify-center gap-4 animate-slide-up stagger-3">
            {isActive ? (
              <Link
                to="/play"
                className="group flex items-center gap-2 px-8 py-3.5 rounded-xl btn-glow text-white font-semibold text-lg"
              >
                <Zap className="w-5 h-5" />
                Join Tournament
                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ) : (
              <div className="flex items-center gap-2 px-8 py-3.5 rounded-xl glass-card text-arena-text-muted font-medium text-lg">
                <Timer className="w-5 h-5 text-arena-accent" />
                Next Tournament Soon
              </div>
            )}
            <Link
              to="/leaderboard"
              className="group flex items-center gap-2 px-8 py-3.5 rounded-xl glass-card text-arena-text hover:border-arena-primary/40 font-medium text-lg"
            >
              <Trophy className="w-5 h-5 text-arena-accent" />
              Leaderboard
            </Link>
          </div>
        </div>
      </section>

      {/* ── Tournament Status ───────────────────────────────── */}
      <section className="max-w-lg mx-auto animate-slide-up stagger-4">
        <div className="glass-card rounded-2xl p-8 glow-purple">
          <CountdownTimer />

          {tournament && (
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="flex flex-col items-center p-3 rounded-xl bg-arena-bg/40">
                <Users className="w-5 h-5 text-arena-primary mb-1" />
                <p className="text-2xl font-bold text-arena-text font-mono">
                  {tournament.totalPlayers}
                </p>
                <p className="text-[11px] text-arena-text-dim">Players</p>
              </div>
              <div className="flex flex-col items-center p-3 rounded-xl bg-arena-bg/40">
                <CheckCircle2 className="w-5 h-5 text-arena-success mb-1" />
                <p className="text-2xl font-bold text-arena-success font-mono">
                  {tournament.totalCompletions}
                </p>
                <p className="text-[11px] text-arena-text-dim">Completions</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Feature Cards ───────────────────────────────────── */}
      <section className="grid md:grid-cols-3 gap-6">
        <FeatureCard
          icon={<Link2 className="w-6 h-6" />}
          iconColor="text-arena-primary"
          title="Fully On-Chain"
          description="Every cell placement is a blockchain transaction on your personal Linera microchain. No backend servers. No databases. Pure decentralization."
          delay="stagger-1"
        />
        <FeatureCard
          icon={<Trophy className="w-6 h-6" />}
          iconColor="text-arena-accent"
          title="Competitive Tournaments"
          description="Same deterministic puzzle for every player. Your Arena Rating combines speed, accuracy, and progress. Real-time leaderboard from the Hub chain."
          delay="stagger-2"
        />
        <FeatureCard
          icon={<ShieldCheck className="w-6 h-6" />}
          iconColor="text-arena-success"
          title="Trustless & Verifiable"
          description="Puzzles generated from on-chain seeds via ChaCha8Rng. Scores computed by WASM smart contracts. Any game can be replayed and audited."
          delay="stagger-3"
        />
      </section>

      {/* ── How It Works ────────────────────────────────────── */}
      <section className="grid md:grid-cols-2 gap-8 items-start">
        <div className="animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-arena-accent" />
            <h2 className="text-xl font-bold">How It Works</h2>
          </div>
          <HowToPlay />
        </div>

        {/* Architecture Visual */}
        <div className="glass-card rounded-2xl p-6 animate-slide-up stagger-2">
          <div className="flex items-center gap-2 mb-5">
            <Blocks className="w-5 h-5 text-arena-primary" />
            <h3 className="font-bold text-sm">Linera Microchain Architecture</h3>
          </div>

          <div className="space-y-3">
            <ArchNode
              icon={<Sparkles className="w-4 h-4 text-arena-accent" />}
              label="Hub Chain"
              detail="Tournament state, leaderboard, puzzle solution"
              type="hub"
            />
            <div className="flex items-center justify-center gap-1 py-1">
              <div className="w-px h-4 bg-arena-border" />
              <span className="text-[10px] text-arena-text-dim px-2">Cross-chain messages</span>
              <div className="w-px h-4 bg-arena-border" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <ArchNode
                icon={<User2Icon />}
                label="Your Chain"
                detail="Your game state"
                type="player"
                highlight
              />
              <ArchNode
                icon={<User2Icon />}
                label="Player 2"
                detail="Their game state"
                type="player"
              />
              <ArchNode
                icon={<User2Icon />}
                label="Player 3"
                detail="Their game state"
                type="player"
              />
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-arena-border/30">
            <p className="text-[11px] text-arena-text-dim leading-relaxed">
              Each player gets their own <span className="text-arena-primary">personal blockchain</span>. 
              The same WASM smart contract runs on every chain. Moves sync to the Hub via cross-chain messages. 
              The Hub computes scores and broadcasts the leaderboard.
            </p>
          </div>
        </div>
      </section>

      {/* ── Connect CTA ─────────────────────────────────────── */}
      {connection.status === ConnectionStatus.Disconnected && (
        <section className="text-center py-8 animate-slide-up">
          <div className="glass-card inline-flex flex-col items-center gap-3 rounded-2xl px-10 py-8">
            <div className="w-12 h-12 rounded-xl bg-arena-primary/10 flex items-center justify-center">
              <Zap className="w-6 h-6 text-arena-primary" />
            </div>
            <p className="text-arena-text font-medium">Ready to compete?</p>
            <p className="text-arena-text-dim text-sm max-w-xs">
              Connect your MetaMask wallet and your Linera microchain will be automatically created
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function FeatureCard({
  icon,
  iconColor,
  title,
  description,
  delay = '',
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  delay?: string;
}) {
  return (
    <div className={`glass-card rounded-2xl p-6 animate-slide-up ${delay}`}>
      <div className={`w-11 h-11 rounded-xl bg-arena-bg/80 border border-arena-border/50 flex items-center justify-center mb-4 ${iconColor}`}>
        {icon}
      </div>
      <h3 className="font-bold text-arena-text mb-2">{title}</h3>
      <p className="text-sm text-arena-text-muted leading-relaxed">{description}</p>
    </div>
  );
}

function ArchNode({
  icon,
  label,
  detail,
  type,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  type: 'hub' | 'player';
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 border text-center ${
        type === 'hub'
          ? 'bg-arena-accent/5 border-arena-accent/20'
          : highlight
            ? 'bg-arena-primary/10 border-arena-primary/30'
            : 'bg-arena-bg/40 border-arena-border/30'
      }`}
    >
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-xs font-semibold">{label}</p>
      <p className="text-[10px] text-arena-text-dim">{detail}</p>
    </div>
  );
}

function User2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-arena-text-dim">
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
}

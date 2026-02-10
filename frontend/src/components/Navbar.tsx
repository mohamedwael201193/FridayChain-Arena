// FridayChain Arena — Navigation Bar

import { Link, useLocation } from 'react-router-dom';
import { useArena } from '../hooks/useArena';
import { ConnectionStatus } from '../lib/arena/types';
import {
  Home,
  Gamepad2,
  Trophy,
  User,
  Wallet,
  LogOut,
  Zap,
  Loader2,
} from 'lucide-react';
import ArenaLogo from './ArenaLogo';

export default function Navbar() {
  const { connection, connect, disconnect, player, connectionStep } = useArena();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="border-b border-arena-border/50 bg-arena-surface/60 backdrop-blur-xl sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-7xl flex items-center justify-between h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group">
          <ArenaLogo size={40} />
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight leading-tight group-hover:text-arena-primary transition-colors">
              Friday<span className="text-arena-accent">Chain</span>
            </span>
            <span className="text-[10px] text-arena-text-dim uppercase tracking-widest leading-tight">Arena</span>
          </div>
        </Link>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-1 bg-arena-bg/50 rounded-xl p-1 border border-arena-border/30">
          <NavLink to="/" active={isActive('/')} icon={<Home className="w-4 h-4" />}>
            Home
          </NavLink>
          <NavLink to="/play" active={isActive('/play')} icon={<Gamepad2 className="w-4 h-4" />}>
            Play
          </NavLink>
          <NavLink to="/leaderboard" active={isActive('/leaderboard')} icon={<Trophy className="w-4 h-4" />}>
            Leaderboard
          </NavLink>
          <NavLink to="/profile" active={isActive('/profile')} icon={<User className="w-4 h-4" />}>
            Profile
          </NavLink>
        </div>

        {/* Wallet */}
        <div className="flex items-center gap-3">
          {connection.status === ConnectionStatus.Connected && player && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-arena-primary/10 border border-arena-primary/20">
              <Zap className="w-3.5 h-3.5 text-arena-primary" />
              <span className="text-sm text-arena-primary font-medium">
                {player.discordUsername}
              </span>
            </div>
          )}

          {connection.status === ConnectionStatus.Connected ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-card">
                <div className="w-2 h-2 rounded-full bg-arena-success shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                <span className="text-xs text-arena-text-muted font-mono hidden sm:block">
                  {connection.address?.slice(0, 6)}...{connection.address?.slice(-4)}
                </span>
              </div>
              <button
                onClick={disconnect}
                className="p-2 rounded-lg border border-arena-border/50 hover:border-arena-error/50 text-arena-text-dim hover:text-arena-error transition-all hover:bg-arena-error/5"
                title="Disconnect"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={connection.status === ConnectionStatus.Connecting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl btn-glow text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed max-w-[280px]"
            >
              {connection.status === ConnectionStatus.Connecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="truncate text-xs">
                    {connectionStep || 'Connecting...'}
                  </span>
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Nav */}
      <div className="md:hidden flex justify-center gap-1 pb-2 px-4">
        <MobileNavLink to="/" active={isActive('/')} icon={<Home className="w-4 h-4" />} label="Home" />
        <MobileNavLink to="/play" active={isActive('/play')} icon={<Gamepad2 className="w-4 h-4" />} label="Play" />
        <MobileNavLink to="/leaderboard" active={isActive('/leaderboard')} icon={<Trophy className="w-4 h-4" />} label="Board" />
        <MobileNavLink to="/profile" active={isActive('/profile')} icon={<User className="w-4 h-4" />} label="Profile" />
      </div>
    </nav>
  );
}

function NavLink({
  to,
  active,
  icon,
  children,
}: {
  to: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-arena-primary/20 text-arena-primary shadow-[0_0_10px_rgba(139,92,246,0.15)]'
          : 'text-arena-text-muted hover:text-arena-text hover:bg-arena-card/50'
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

function MobileNavLink({
  to,
  active,
  icon,
  label,
}: {
  to: string;
  active: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
        active
          ? 'bg-arena-primary/20 text-arena-primary'
          : 'text-arena-text-muted hover:text-arena-text'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

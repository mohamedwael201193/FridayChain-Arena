// FridayChain Arena — Profile Page

import { useState, useMemo } from 'react';
import { useArena } from '../hooks/useArena';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { ConnectionStatus } from '../lib/arena/types';
import {
  Wallet,
  User,
  Gamepad2,
  Shield,
  Pencil,
  Check,
  X,
  Link2,
  Hash,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  Calendar,
  Blocks,
  Eye,
  FileCheck,
} from 'lucide-react';

export default function ProfilePage() {
  const {
    connection,
    connect,
    player,
    updateUsername,
    gameState,
    tournament,
    loading,
    error,
    clearError,
  } = useArena();

  const { entries: leaderboardEntries } = useLeaderboard(10);
  const [editing, setEditing] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  // Compute Arena Rating from Hub leaderboard (authoritative) for profile display
  const TOTAL_CELLS_TO_PLACE = 46;
  const PROGRESS_BONUS_PER_CELL = 150;
  const arenaRating = useMemo(() => {
    if (!gameState?.completed || !connection.signerAddress) return null;
    // Match by on-chain signer address (what the Hub leaderboard stores)
    const mySigner = connection.signerAddress.toLowerCase();
    const myEntry = leaderboardEntries.find(e => e.wallet.toLowerCase() === mySigner);
    if (myEntry) {
      return parseInt(myEntry.score) + TOTAL_CELLS_TO_PLACE * PROGRESS_BONUS_PER_CELL;
    }
    return null;
  }, [gameState, connection.signerAddress, leaderboardEntries]);

  // ── Not connected ──────────────────────────────────────────────────

  if (connection.status !== ConnectionStatus.Connected) {
    return (
      <div className="max-w-lg mx-auto text-center py-20 animate-fade-in">
        <div className="glass-card rounded-2xl p-10">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-arena-primary/20 to-arena-primary/5 flex items-center justify-center border border-arena-primary/20 mb-6">
            <User className="w-8 h-8 text-arena-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-3">Profile</h1>
          <p className="text-arena-text-muted mb-8">
            Connect your wallet to view your profile
          </p>
          <button
            onClick={connect}
            className="btn-glow px-8 py-3.5 rounded-xl text-white font-semibold text-lg transition-all"
          >
            Connect MetaMask
          </button>
        </div>
      </div>
    );
  }

  const handleUpdateUsername = async () => {
    if (!newUsername.trim()) return;
    try {
      await updateUsername(newUsername.trim());
      setEditing(false);
      setNewUsername('');
    } catch {
      // Error handled by hook
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-arena-primary/20 to-arena-primary/5 flex items-center justify-center border border-arena-primary/20">
          <User className="w-5 h-5 text-arena-primary" />
        </div>
        <h1 className="text-3xl font-bold">Profile</h1>
      </div>

      {error && (
        <div className="mb-4 p-3.5 rounded-xl bg-arena-error/10 border border-arena-error/20 text-arena-error text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <button onClick={clearError} className="hover:text-white p-1 rounded-lg hover:bg-arena-error/20 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Wallet Card */}
      <div className="glass-card rounded-2xl p-6 mb-5">
        <h2 className="text-xs font-semibold text-arena-text-dim mb-4 uppercase tracking-wider flex items-center gap-2">
          <Wallet className="w-4 h-4 text-arena-primary" />
          Wallet
        </h2>
        <div className="space-y-3">
          <InfoRow icon={<Link2 className="w-3.5 h-3.5" />} label="MetaMask Address" value={connection.address || ''} mono />
          <InfoRow icon={<Hash className="w-3.5 h-3.5" />} label="On-chain Signer" value={connection.signerAddress || ''} mono />
          <InfoRow icon={<Blocks className="w-3.5 h-3.5" />} label="Chain ID" value={connection.chainId || ''} mono />
          <InfoRow
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            label="Status"
            value="Connected"
            valueColor="text-arena-success"
          />
        </div>
      </div>

      {/* Player Card */}
      <div className="glass-card rounded-2xl p-6 mb-5">
        <h2 className="text-xs font-semibold text-arena-text-dim mb-4 uppercase tracking-wider flex items-center gap-2">
          <User className="w-4 h-4 text-arena-accent" />
          Player
        </h2>

        {player ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-arena-text-muted flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-arena-text-dim" />
                Discord Username
              </span>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder={player.discordUsername}
                    maxLength={32}
                    className="px-3 py-1.5 text-sm rounded-lg bg-arena-bg/50 border border-arena-border/50 text-arena-text focus:outline-none focus:border-arena-primary/50"
                  />
                  <button
                    onClick={handleUpdateUsername}
                    disabled={loading || !newUsername.trim()}
                    className="p-1.5 rounded-lg bg-arena-success/20 text-arena-success hover:bg-arena-success/30 disabled:opacity-50 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="p-1.5 rounded-lg bg-arena-error/20 text-arena-error hover:bg-arena-error/30 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-arena-primary">
                    {player.discordUsername}
                  </span>
                  <button
                    onClick={() => {
                      setEditing(true);
                      setNewUsername(player.discordUsername);
                    }}
                    className="p-1 rounded-lg text-arena-text-dim hover:text-arena-text hover:bg-arena-card/50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <InfoRow
              icon={<Calendar className="w-3.5 h-3.5" />}
              label="Registered"
              value={new Date(
                parseInt(player.registeredAtMicros) / 1000,
              ).toLocaleDateString()}
            />
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-arena-text-muted text-sm">
              Not registered. Go to the Play page to register.
            </p>
          </div>
        )}
      </div>

      {/* Current Game Card */}
      {tournament && tournament.active && gameState && (
        <div className="glass-card rounded-2xl p-6 mb-5">
          <h2 className="text-xs font-semibold text-arena-text-dim mb-4 uppercase tracking-wider flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-arena-success" />
            Current Game
          </h2>
          <div className="space-y-3">
            <InfoRow icon={<Trophy className="w-3.5 h-3.5" />} label="Tournament" value={`#${tournament.id}`} />
            <InfoRow icon={<Hash className="w-3.5 h-3.5" />} label="Moves" value={String(gameState.moveCount)} />
            <InfoRow
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              label="Penalties"
              value={String(gameState.penaltyCount)}
              valueColor={
                gameState.penaltyCount > 0
                  ? 'text-arena-error'
                  : 'text-arena-success'
              }
            />
            <InfoRow
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              label="Status"
              value={gameState.completed ? 'Completed' : 'In Progress'}
              valueColor={
                gameState.completed ? 'text-arena-success' : 'text-arena-warning'
              }
            />
            {gameState.completed && arenaRating !== null && (
              <InfoRow
                icon={<Trophy className="w-3.5 h-3.5" />}
                label="Arena Rating"
                value={arenaRating.toLocaleString()}
                valueColor="text-arena-accent"
              />
            )}
          </div>
        </div>
      )}

      {/* On-Chain Guarantees */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-xs font-semibold text-arena-text-dim mb-4 uppercase tracking-wider flex items-center gap-2">
          <Shield className="w-4 h-4 text-arena-primary" />
          On-Chain Guarantees
        </h2>
        <div className="space-y-3">
          <GuaranteeRow
            icon={<Blocks className="w-4 h-4 text-arena-primary" />}
            text="Your profile is stored permanently on your Linera microchain"
          />
          <GuaranteeRow
            icon={<Hash className="w-4 h-4 text-arena-accent" />}
            text="Username changes require an on-chain transaction (costs gas)"
          />
          <GuaranteeRow
            icon={<Eye className="w-4 h-4 text-arena-success" />}
            text="All game moves are recorded on-chain and are publicly verifiable"
          />
          <GuaranteeRow
            icon={<Shield className="w-4 h-4 text-arena-warning" />}
            text="Your score is computed by the smart contract, not the frontend"
          />
          <GuaranteeRow
            icon={<FileCheck className="w-4 h-4 text-arena-text-muted" />}
            text="You can replay any player's game from chain history"
          />
        </div>
      </div>
    </div>
  );
}

function GuaranteeRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3 text-sm text-arena-text-muted">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <span>{text}</span>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono = false,
  valueColor = 'text-arena-text',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-arena-text-muted flex items-center gap-1.5">
        {icon && <span className="text-arena-text-dim">{icon}</span>}
        {label}
      </span>
      <span
        className={`text-sm font-medium ${valueColor} ${
          mono ? 'font-mono text-xs' : ''
        } truncate max-w-[250px]`}
      >
        {value}
      </span>
    </div>
  );
}

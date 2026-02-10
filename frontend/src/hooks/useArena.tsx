// FridayChain Arena — Main Arena Context & Hook
//
// Provides global state management using React context.
// All state is derived from on-chain queries — no local database.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import * as lineraClient from '../lib/linera/lineraClient';
import * as metamask from '../lib/metamask/metamaskSigner';
import * as arenaApi from '../lib/arena/arenaApi';
import type {
  ConnectionState,
  PlayerGameState,
  PlayerInfo,
  Tournament,
} from '../lib/arena/types';
import { ConnectionStatus } from '../lib/arena/types';

// ── Context Shape ────────────────────────────────────────────────────────

interface ArenaContextValue {
  // Connection
  connection: ConnectionState;
  connect: () => Promise<void>;
  disconnect: () => void;

  // Player
  player: PlayerInfo | null;
  registerPlayer: (discordUsername: string) => Promise<void>;
  updateUsername: (newUsername: string) => Promise<void>;

  // Tournament
  tournament: Tournament | null;
  puzzleBoard: number[][] | null;
  gameState: PlayerGameState | null;

  // Game actions
  placeCell: (row: number, col: number, value: number) => Promise<boolean>;
  clearCell: (row: number, col: number) => Promise<void>;

  // Refresh
  refreshGameState: () => Promise<void>;
  refreshTournament: () => Promise<void>;

  // UI state
  loading: boolean;
  error: string | null;
  clearError: () => void;
  connectionStep: string | null;
}

const ArenaContext = createContext<ArenaContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────

export function ArenaProvider({ children }: { children: React.ReactNode }) {
  // Connection state
  const [connection, setConnection] = useState<ConnectionState>({
    status: ConnectionStatus.Disconnected,
    address: null,
    signerAddress: null,
    chainId: null,
    error: null,
  });

  // Data state
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [puzzleBoard, setPuzzleBoard] = useState<number[][] | null>(null);
  const [gameState, setGameState] = useState<PlayerGameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStep, setConnectionStep] = useState<string | null>(null);

  // Polling interval ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Connect ──────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    try {
      setConnection((prev) => ({
        ...prev,
        status: ConnectionStatus.Connecting,
        error: null,
      }));
      setConnectionStep('Connecting to MetaMask...');

      // 1. Connect MetaMask — this is the user's IDENTITY (EVM address)
      const account = await metamask.connectMetaMask();
      const evmAddress = account.address;
      console.log('[Arena] MetaMask connected:', evmAddress);

      // 2. Initialize Linera WASM and connect to Conway testnet
      //    PrivateKey signer is persisted in localStorage keyed by MetaMask address
      //    Set progress callback so UI shows each step
      lineraClient.setProgressCallback((step) => setConnectionStep(step));
      const result = await lineraClient.connectToLinera(evmAddress);
      lineraClient.setProgressCallback(null);
      setConnectionStep(null);
      console.log('[Arena] Linera connected, chain:', result.chainId, 'signer:', result.signerAddress);

      // Use MetaMask address as the display identity
      setConnection({
        status: ConnectionStatus.Connected,
        address: evmAddress,
        signerAddress: result.signerAddress,
        chainId: result.chainId,
        error: null,
      });

      // 3. Check localStorage for previously registered player
      const persisted = lineraClient.getPersistedPlayer(evmAddress);
      if (persisted) {
        console.log('[Arena] Restored player from localStorage:', persisted.discordUsername);
        setPlayer({
          wallet: evmAddress,
          discordUsername: persisted.discordUsername,
          registeredAtMicros: persisted.registeredAt,
        });

        // Auto-re-register on the new chain (non-blocking, silently)
        arenaApi.registerPlayer(persisted.discordUsername).catch((e) => {
          console.warn('[Arena] Auto-re-register failed (may be fine):', e);
        });
      }

      // 4. Subscribe to Hub chain events (non-blocking)
      arenaApi.subscribeToHub().catch((e) => {
        console.warn('Failed to subscribe to hub (may already be subscribed):', e);
      });

      // 5. Load tournament state (non-blocking)
      refreshTournamentInternal().catch(() => {
        console.log('No active tournament');
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      console.error('[Arena] Connection failed:', message);
      lineraClient.setProgressCallback(null);
      setConnectionStep(null);
      setConnection({
        status: ConnectionStatus.Error,
        address: null,
        signerAddress: null,
        chainId: null,
        error: message,
      });
      setError(message);
    }
  }, []);

  // ── Disconnect ───────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    setConnection({
      status: ConnectionStatus.Disconnected,
      address: null,
      signerAddress: null,
      chainId: null,
      error: null,
    });
    setPlayer(null);
    setTournament(null);
    setPuzzleBoard(null);
    setGameState(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ── Register Player ──────────────────────────────────────────────────

  const registerPlayerFn = useCallback(
    async (discordUsername: string) => {
      setLoading(true);
      setError(null);
      try {
        await arenaApi.registerPlayer(discordUsername);
        // Registration succeeded on-chain.
        // Set player data locally with MetaMask address as identity.
        const evmAddr = connection.address || '';
        setPlayer({
          wallet: evmAddr,
          discordUsername,
          registeredAtMicros: String(Date.now() * 1000),
        });
        // Persist to localStorage so it survives page reloads
        lineraClient.persistPlayerRegistration(evmAddr, discordUsername);
        console.log('[Arena] Player registered successfully:', discordUsername);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Registration failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [connection.address],
  );

  // ── Update Username ──────────────────────────────────────────────────

  const updateUsernameFn = useCallback(
    async (newUsername: string) => {
      setLoading(true);
      setError(null);
      try {
        await arenaApi.updateUsername(newUsername);
        if (connection.address) {
          const playerData = await arenaApi.getPlayer(connection.address);
          setPlayer(playerData);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Update failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [connection.address],
  );

  // ── Place Cell ───────────────────────────────────────────────────────

  const placeCellFn = useCallback(
    async (row: number, col: number, value: number): Promise<boolean> => {
      try {
        await arenaApi.placeCell(row, col, value);
        // Refresh game state to see the result
        await refreshGameStateInternal();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Move failed';
        setError(message);
        return false;
      }
    },
    [connection.signerAddress],
  );

  // ── Clear Cell ───────────────────────────────────────────────────────

  const clearCellFn = useCallback(
    async (row: number, col: number) => {
      try {
        await arenaApi.clearCell(row, col);
        await refreshGameStateInternal();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Clear failed';
        setError(message);
      }
    },
    [connection.signerAddress],
  );

  // ── Refresh Functions ────────────────────────────────────────────────

  const refreshGameStateInternal = async () => {
    if (!connection.signerAddress) return;
    try {
      const gs = await arenaApi.getPlayerGameState(connection.signerAddress);
      setGameState(gs);
    } catch (e) {
      console.warn('Failed to refresh game state:', e);
    }
  };

  const refreshTournamentInternal = async () => {
    try {
      const t = await arenaApi.getActiveTournament();
      setTournament(t);

      if (t?.active) {
        const board = await arenaApi.getPuzzleBoard();
        setPuzzleBoard(board);
      }
    } catch (e) {
      console.warn('Failed to refresh tournament:', e);
    }
  };

  const refreshGameState = useCallback(refreshGameStateInternal, [connection.signerAddress]);
  const refreshTournament = useCallback(refreshTournamentInternal, []);

  const clearError = useCallback(() => setError(null), []);

  // ── Polling ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (connection.status !== ConnectionStatus.Connected) return;

    // Poll every 3 seconds during active tournament
    const poll = async () => {
      await refreshTournamentInternal();
      if (connection.signerAddress) {
        await refreshGameStateInternal();
      }
    };

    pollRef.current = setInterval(poll, 3000);

    // Also register for block notifications
    lineraClient.onNotification(async () => {
      await poll();
    });

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [connection.status, connection.signerAddress]);

  // ── Listen for MetaMask account changes ──────────────────────────────

  useEffect(() => {
    metamask.onAccountChanged((accounts) => {
      if (accounts.length === 0) {
        disconnect();
      }
    });
  }, [disconnect]);

  // ── Context Value ────────────────────────────────────────────────────

  const value: ArenaContextValue = {
    connection,
    connect,
    disconnect,
    player,
    registerPlayer: registerPlayerFn,
    updateUsername: updateUsernameFn,
    tournament,
    puzzleBoard,
    gameState,
    placeCell: placeCellFn,
    clearCell: clearCellFn,
    refreshGameState,
    refreshTournament,
    loading,
    error,
    clearError,
    connectionStep,
  };

  return (
    <ArenaContext.Provider value={value}>{children}</ArenaContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useArena(): ArenaContextValue {
  const ctx = useContext(ArenaContext);
  if (!ctx) {
    throw new Error('useArena must be used within an ArenaProvider');
  }
  return ctx;
}

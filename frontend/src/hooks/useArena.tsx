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
import { useSuspiciousMoveDetector } from './useSuspiciousMoveDetector';
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
  connectQuick: () => Promise<void>;
  disconnect: () => void;
  isInitializing: boolean;

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

  // Anti-cheat
  isSuspicious: boolean;

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
  // True until first tournament fetch completes after connecting
  const [isInitializing, setIsInitializing] = useState(false);

  // Anti-cheat detector
  const cheatDetector = useSuspiciousMoveDetector();

  // Track tournament ID to detect changes and clear stale game state
  const lastTournamentIdRef = useRef<string | null>(null);

  // Polling interval ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Connect ──────────────────────────────────────────────────────────

  // ── Shared post-connect setup ────────────────────────────────────────

  const afterConnect = async (
    storageKey: string,
    displayAddress: string,
    signerAddr: string,
    chainId: string,
    isQuickPlay: boolean,
  ) => {
    setConnection({
      status: ConnectionStatus.Connected,
      address: displayAddress,
      signerAddress: signerAddr,
      chainId,
      error: null,
      isQuickPlay,
      storageKey,
    });

    // Restore previously registered player from localStorage
    const persisted = lineraClient.getPersistedPlayer(storageKey);
    if (persisted) {
      console.log('[Arena] Restored player from localStorage:', persisted.discordUsername);
      setPlayer({
        wallet: signerAddr,
        discordUsername: persisted.discordUsername,
        registeredAtMicros: persisted.registeredAt,
      });
      arenaApi.registerPlayer(persisted.discordUsername).catch((e) => {
        console.warn('[Arena] Auto-re-register failed (may be fine):', e);
      });
    }

    // Load tournament state — spinner stays on until refreshTournamentInternal
    // gets a definitive Hub response (success → setIsInitializing(false)).
    // On Hub errors the spinner remains so the 3s polling retries silently.
    setIsInitializing(true);
    refreshTournamentInternal().catch(() => {});

    // Subscribe in the background so the first tournament render does not wait
    // for a player-chain mutation on brand-new browsers/accounts.
    arenaApi.subscribeToHub().then(() => {
      lineraClient.retryHubAppInit().catch(() => {});
    }).catch((e) => {
      console.warn('Failed to subscribe to hub (may already be subscribed):', e);
    });
  };

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

      // 2. Connect to Linera (PrivateKey persisted by MetaMask address)
      setConnectionStep('Connecting to Linera...');
      const result = await lineraClient.connectToLinera(evmAddress);
      setConnectionStep(null);
      console.log('[Arena] Linera connected, chain:', result.chainId, 'signer:', result.signerAddress);

      await afterConnect(evmAddress, evmAddress, result.signerAddress, result.chainId, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      console.error('[Arena] Connection failed:', message);
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

  // ── Quick Play (no MetaMask) ─────────────────────────────────────────

  const connectQuick = useCallback(async () => {
    try {
      setConnection((prev) => ({
        ...prev,
        status: ConnectionStatus.Connecting,
        error: null,
      }));
      setConnectionStep('Generating your Linera identity...');

      const deviceId = lineraClient.getOrCreateQuickDeviceId();
      const result = await lineraClient.connectToLineraDirect();
      setConnectionStep(null);
      console.log('[Arena] Quick Play connected, chain:', result.chainId, 'signer:', result.signerAddress);

      // Use signer address as display identity (no MetaMask address available)
      await afterConnect(deviceId, result.signerAddress, result.signerAddress, result.chainId, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      console.error('[Arena] Quick Play connection failed:', message);
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
    setIsInitializing(false);
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
        // Use signerAddress as wallet identity (works for both MetaMask and Quick Play)
        const walletAddr = connection.signerAddress || connection.address || '';
        setPlayer({
          wallet: walletAddr,
          discordUsername,
          registeredAtMicros: String(Date.now() * 1000),
        });
        // Persist to localStorage keyed by storageKey (MetaMask addr or Quick Play device ID)
        const storageKey = connection.storageKey || connection.address || '';
        lineraClient.persistPlayerRegistration(storageKey, discordUsername);
        console.log('[Arena] Player registered successfully:', discordUsername);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Registration failed';
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [connection.signerAddress, connection.address, connection.storageKey],
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
        cheatDetector.recordMove();
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

  // ── Game State Backup (localStorage safety net) ───────────────────────

  const GAMESTATE_KEY = 'fridaychain_arena_gamestate';

  const getStorageKeyForGameState = () =>
    (connection.storageKey || connection.address || '').toLowerCase();

  const backupGameState = (gs: PlayerGameState) => {
    const key = getStorageKeyForGameState();
    if (!key) return;
    try {
      localStorage.setItem(GAMESTATE_KEY + '_' + key, JSON.stringify(gs));
    } catch { /* ignore */ }
  };

  const restoreGameState = (): PlayerGameState | null => {
    const key = getStorageKeyForGameState();
    if (!key) return null;
    try {
      const raw = localStorage.getItem(GAMESTATE_KEY + '_' + key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  };

  // ── Refresh Functions ────────────────────────────────────────────────

  const refreshGameStateInternal = async () => {
    if (!connection.signerAddress) return;
    try {
      const gs = await arenaApi.getPlayerGameState(connection.signerAddress);
      if (gs) {
        setGameState(gs);
        backupGameState(gs);
      } else {
        // Chain returned null — player hasn't started the current tournament yet.
        // Clear any stale state so the UI shows the fresh puzzle.
        setGameState(null);
      }
    } catch (e) {
      console.warn('Failed to refresh game state:', e);
    }
  };

  const refreshTournamentInternal = async () => {
    try {
      const t = await arenaApi.getActiveTournament();

      // Detect tournament change — clear stale game state from previous tournament
      if (t && t.id !== lastTournamentIdRef.current) {
        console.log(`[Arena] Tournament changed: ${lastTournamentIdRef.current} → ${t.id}`);
        lastTournamentIdRef.current = t.id;
        // Clear old game state so gameplay page shows fresh puzzle
        setGameState(null);
        // Clear localStorage backup (belongs to old tournament)
        const key = getStorageKeyForGameState();
        if (key) {
          try {
            localStorage.removeItem(GAMESTATE_KEY + '_' + key);
          } catch { /* ignore */ }
        }
      }

      // Only update tournament state when we got a successful Hub response.
      // If t is null it's fine (no active tournament) — set it.
      // If t is stale (inactive) and we had none before, also set it.
      setTournament(t);

      // Hub gave us a definitive answer — stop showing the initializing spinner
      setIsInitializing(false);

      if (t?.active) {
        const board = await arenaApi.getPuzzleBoard();
        setPuzzleBoard(board);
      }
    } catch (e) {
      // Hub query failed (e.g. new chain, blob not found yet).
      // Leave tournament state unchanged AND keep isInitializing = true so the
      // spinner keeps showing. Polling will retry in 3 seconds.
      // Do NOT set isInitializing = false here or the stale "No Tournament" flash returns.
      console.warn('[Arena] Hub query failed, will retry:', (e as Error).message);
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
    connectQuick,
    disconnect,
    isInitializing,
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
    isSuspicious: cheatDetector.isSuspicious,
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

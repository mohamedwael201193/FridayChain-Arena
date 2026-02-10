// FridayChain Arena — Linera WASM Client Singleton
//
// Manages the connection between the browser and the Linera network.
// Uses @linera/client WASM module for trustless, fully client-side chain interaction.
// Persists the PrivateKey signer in localStorage keyed by MetaMask address
// so the same on-chain identity survives page reloads.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lineraModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lineraClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lineraChain: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lineraApp: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hubApp: any = null; // Application handle for Hub chain queries
let userChainId: string | null = null;
let signerAddress: string | null = null;
let isInitialized = false;

// ── Configuration ────────────────────────────────────────────────────────

const FAUCET_URL =
  import.meta.env.VITE_FAUCET_URL || 'https://faucet.testnet-conway.linera.net';
const APP_ID = import.meta.env.VITE_APP_ID || '';
const HUB_CHAIN_ID = import.meta.env.VITE_HUB_CHAIN_ID || '';

// ── Timeout Helper ───────────────────────────────────────────────────────

/**
 * Race a promise against a timeout. If the timeout fires first, reject with message.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ── Session Persistence ──────────────────────────────────────────────────

const SESSION_STORAGE_KEY = 'fridaychain_arena_session';

// Connection progress callback for UI feedback
type ProgressCallback = (step: string) => void;
let _onProgress: ProgressCallback | null = null;

export function setProgressCallback(cb: ProgressCallback | null): void {
  _onProgress = cb;
}

function reportProgress(step: string): void {
  console.log(`[Linera] ${step}`);
  if (_onProgress) _onProgress(step);
}

interface StoredSession {
  privateKeyHex: string;
  signerAddress: string;
  evmAddress: string;
  discordUsername?: string;
  registeredAt?: string;
  appId?: string; // Track which App ID this session belongs to
}

function getStoredSession(evmAddress: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY + '_' + evmAddress.toLowerCase());
    if (!raw) return null;
    const session: StoredSession = JSON.parse(raw);
    // If App ID changed (new deployment), keep the private key and username
    // but clear the registration status so auto-re-register kicks in
    if (session.appId && session.appId !== APP_ID) {
      console.log('[Linera] App ID changed — keeping signer key, clearing registration for', evmAddress);
      session.appId = APP_ID;
      session.registeredAt = undefined; // Force re-register on new contract
      storeSession(session);
    }
    return session;
  } catch {
    return null;
  }
}

function storeSession(session: StoredSession): void {
  try {
    localStorage.setItem(
      SESSION_STORAGE_KEY + '_' + session.evmAddress.toLowerCase(),
      JSON.stringify(session),
    );
  } catch (e) {
    console.warn('[Linera] Failed to persist session:', e);
  }
}

/** Save player registration info to the stored session. */
export function persistPlayerRegistration(evmAddress: string, discordUsername: string): void {
  const session = getStoredSession(evmAddress);
  if (session) {
    session.discordUsername = discordUsername;
    session.registeredAt = String(Date.now() * 1000);
    storeSession(session);
  }
}

/** Get persisted player data if available. */
export function getPersistedPlayer(evmAddress: string): { discordUsername: string; registeredAt: string } | null {
  const session = getStoredSession(evmAddress);
  if (session?.discordUsername) {
    return {
      discordUsername: session.discordUsername,
      registeredAt: session.registeredAt || String(Date.now() * 1000),
    };
  }
  return null;
}

// ── Initialization ───────────────────────────────────────────────────────

/**
 * Initialize the Linera WASM module. Must be called once before any other
 * operations. Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initLinera(): Promise<void> {
  if (isInitialized) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linera: any = await import('@linera/client');
    if (linera.initialize && typeof linera.initialize === 'function') {
      await linera.initialize();
    }
    lineraModule = linera;
    isInitialized = true;
    console.log('[Linera] WASM module initialized');
  } catch (err) {
    console.error('[Linera] Failed to initialize WASM module:', err);
    throw err;
  }
}

/**
 * Connect to the Linera network with session persistence:
 * - Persists PrivateKey in localStorage keyed by MetaMask address
 * - Same MetaMask account = same signer address across reloads
 * - New chain is claimed each reload (unavoidable without wallet serialization)
 * - Auto-re-registers silently if previously registered
 *
 * Flow: Faucet → Wallet → PrivateKey (restored or new) → claimChain → Client → Chain → App
 */
export async function connectToLinera(evmAddress: string): Promise<{ chainId: string; signerAddress: string }> {
  if (!isInitialized) {
    await initLinera();
  }

  try {
    // 1. Create faucet (sync constructor)
    reportProgress('Connecting to Linera faucet...');
    const faucet = new lineraModule.Faucet(FAUCET_URL);

    // 2. Create wallet from faucet (fetches genesis config)
    reportProgress('Creating wallet...');
    const wallet = await faucet.createWallet();
    console.log('[Linera] Wallet created');

    // 3. Create or restore PrivateKey signer
    const stored = getStoredSession(evmAddress);
    let signer;
    let privateKeyHex: string;

    if (stored?.privateKeyHex) {
      // RESTORE: Same signer address as before
      reportProgress('Restoring your identity...');
      signer = new lineraModule.signer.PrivateKey(stored.privateKeyHex);
      privateKeyHex = stored.privateKeyHex;
      console.log('[Linera] Restored signer address:', signer.address());
    } else {
      // FIRST TIME: Generate random key and derive hex for storage
      reportProgress('Creating new blockchain identity...');
      // Generate 32 random bytes as a private key hex
      const keyBytes = new Uint8Array(32);
      crypto.getRandomValues(keyBytes);
      privateKeyHex = '0x' + Array.from(keyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      signer = new lineraModule.signer.PrivateKey(privateKeyHex);
      console.log('[Linera] New signer address:', signer.address());
    }

    const owner = signer.address();
    signerAddress = owner.toString();

    // 4. Claim a microchain from the faucet
    reportProgress('Claiming your microchain...');
    const chainId = await faucet.claimChain(wallet, owner);
    userChainId = chainId.toString();
    console.log('[Linera] Chain claimed:', userChainId);

    // 5. Persist session to localStorage (includes App ID for staleness detection)
    storeSession({
      privateKeyHex,
      signerAddress: signerAddress!,
      evmAddress,
      discordUsername: stored?.discordUsername,
      registeredAt: stored?.registeredAt,
      appId: APP_ID,
    });

    // 6. Create client connected to the network
    // This step downloads application bytecodes from validators — can take 30-90s
    reportProgress('Syncing with blockchain validators (this may take a minute)...');
    lineraClient = await withTimeout(
      new lineraModule.Client(wallet, signer),
      120_000,
      'Client creation timed out — Conway testnet validators may be slow. Please try again.',
    );
    console.log('[Linera] Client created');

    // 7. Get the Chain handle
    reportProgress('Connecting to your chain...');
    lineraChain = await withTimeout(
      lineraClient.chain(userChainId),
      60_000,
      'Failed to get chain handle — validators may be slow.',
    );
    console.log('[Linera] Chain handle obtained');

    // 8. Get the Application handle for queries/mutations on player's chain
    if (APP_ID) {
      reportProgress('Loading application...');
      lineraApp = await withTimeout(
        lineraChain.application(APP_ID),
        60_000,
        'Failed to get application handle — try refreshing the page.',
      );
      console.log('[Linera] Application handle obtained');
    }

    // 9. Connect to Hub chain LAZILY (non-blocking)
    //    Hub chain has all tournament data — it's heavier to sync.
    //    Don't block the user connection for this; load it in background.
    //    queryHub() will wait for this if needed, or fall back to player chain.
    if (APP_ID && HUB_CHAIN_ID) {
      connectHubAsync(); // fire-and-forget
    }

    console.log('[Linera] Connected successfully. Chain ID:', userChainId, 'Signer:', signerAddress);
    return { chainId: userChainId!, signerAddress: signerAddress! };
  } catch (err) {
    console.error('[Linera] Failed to connect:', err);
    throw err;
  }
}

// ── Hub Chain Lazy Connection ────────────────────────────────────────────

let hubConnectPromise: Promise<void> | null = null;

/**
 * Connect to the Hub chain in the background.
 * Called after initial connection — doesn't block the user.
 */
function connectHubAsync(): void {
  if (hubConnectPromise) return; // already in progress
  hubConnectPromise = (async () => {
    try {
      console.log('[Linera] Background: Connecting to tournament hub...');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hubChain: any = await withTimeout(
        lineraClient.chain(HUB_CHAIN_ID),
        120_000,
        'Hub chain sync timed out',
      );
      hubApp = await withTimeout(
        hubChain.application(APP_ID),
        60_000,
        'Hub app handle timed out',
      );
      console.log('[Linera] Background: Hub application handle obtained');
    } catch (err) {
      console.warn('[Linera] Background: Failed to get Hub app handle (will use player chain):', err);
      hubConnectPromise = null; // allow retry
    }
  })();
}

// ── Queries & Mutations ──────────────────────────────────────────────────

/**
 * Helper: format a GraphQL request into the JSON string Linera expects.
 */
function gql(queryStr: string, variables: Record<string, unknown> = {}): string {
  return JSON.stringify({ query: queryStr, variables });
}

/**
 * Execute a GraphQL query against the application on the user's chain.
 */
export async function query(graphqlQuery: string, variables?: Record<string, unknown>): Promise<unknown> {
  assertConnected();

  const request = gql(graphqlQuery, variables);
  const response = await lineraApp.query(request);
  const parsed = typeof response === 'string' ? JSON.parse(response) : response;

  if (parsed.errors && parsed.errors.length > 0) {
    console.error('[Linera] Query errors:', parsed.errors);
    throw new Error(parsed.errors[0].message || 'GraphQL query failed');
  }

  return parsed.data;
}

/**
 * Execute a GraphQL mutation against the application on the user's chain.
 * 
 * In @linera/client, both queries and mutations go through app.query().
 * The service's MutationRoot calls schedule_operation() internally,
 * and the WASM client automatically proposes a block with those operations.
 */
export async function mutate(graphqlMutation: string, variables?: Record<string, unknown>): Promise<unknown> {
  assertConnected();

  const request = gql(graphqlMutation, variables);
  console.log('[Linera] Sending mutation:', request);

  try {
    // Mutations also go through .query() — the service schedules operations
    // via MutationRoot, and the client auto-proposes blocks.
    const response = await lineraApp.query(request);
    console.log('[Linera] Mutation raw response:', response);
    const parsed = typeof response === 'string' ? JSON.parse(response) : response;

    if (parsed.errors && parsed.errors.length > 0) {
      console.error('[Linera] Mutation errors:', parsed.errors);
      throw new Error(parsed.errors[0].message || 'GraphQL mutation failed');
    }

    return parsed.data;
  } catch (err) {
    console.error('[Linera] Mutation failed:', err);
    throw err;
  }
}

/**
 * Execute a GraphQL query against the Hub chain's application.
 * Tournament data, leaderboard, and puzzle boards live on the Hub chain,
 * not on the player's chain.
 *
 * If the hub connection is still loading in the background, wait up to 30s
 * for it. Falls back to the player's chain app handle if hub is unavailable.
 */
export async function queryHub(graphqlQuery: string, variables?: Record<string, unknown>): Promise<unknown> {
  // Wait for lazy hub connection if in progress (with timeout)
  if (!hubApp && hubConnectPromise) {
    try {
      await withTimeout(hubConnectPromise, 30_000, 'Hub still syncing');
    } catch {
      // Hub not ready yet — fall through to player chain
    }
  }

  const appHandle = hubApp || lineraApp;
  if (!appHandle) {
    throw new Error('Linera client not connected. Call connectToLinera() first.');
  }

  const request = gql(graphqlQuery, variables);
  const response = await appHandle.query(request);
  const parsed = typeof response === 'string' ? JSON.parse(response) : response;

  if (parsed.errors && parsed.errors.length > 0) {
    console.error('[Linera] Hub query errors:', parsed.errors);
    throw new Error(parsed.errors[0].message || 'Hub GraphQL query failed');
  }

  return parsed.data;
}

/**
 * Execute a GraphQL query against a specific chain.
 */
export async function queryChain(chainId: string, graphqlQuery: string, variables?: Record<string, unknown>): Promise<unknown> {
  if (chainId === HUB_CHAIN_ID) {
    return queryHub(graphqlQuery, variables);
  }
  return query(graphqlQuery, variables);
}

// ── Notification Listener ────────────────────────────────────────────────

/**
 * Register a callback for new block notifications.
 */
export function onNotification(callback: (notification: unknown) => void): void {
  if (!lineraChain) {
    console.warn('[Linera] Chain not connected, cannot register notification listener');
    return;
  }

  try {
    lineraChain.onNotification((notification: unknown) => {
      callback(notification);
    });
  } catch (err) {
    console.warn('[Linera] Failed to register notification listener:', err);
  }
}

// ── Getters ──────────────────────────────────────────────────────────────

export function getChainId(): string | null {
  return userChainId;
}

export function getAppId(): string {
  return APP_ID;
}

export function getHubChainId(): string {
  return HUB_CHAIN_ID;
}

export function getSignerAddress(): string | null {
  return signerAddress;
}

export function isConnected(): boolean {
  return lineraChain !== null && userChainId !== null;
}

// ── Internal ─────────────────────────────────────────────────────────────

function assertConnected(): void {
  if (!lineraApp || !userChainId) {
    throw new Error('Linera client not connected. Call connectToLinera() first.');
  }
}


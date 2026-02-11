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

// ── Session Persistence ──────────────────────────────────────────────────

const SESSION_STORAGE_KEY = 'fridaychain_arena_session';

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

    // Validate privateKeyHex — old buggy code stored "[object Object]" as hex
    if (session.privateKeyHex && !/^0x[0-9a-fA-F]{64}$/.test(session.privateKeyHex)) {
      console.warn('[Linera] Corrupted privateKeyHex detected, clearing stored session for', evmAddress);
      localStorage.removeItem(SESSION_STORAGE_KEY + '_' + evmAddress.toLowerCase());
      return null;
    }

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
    // Check cross-origin isolation (required for SharedArrayBuffer / WASM threading)
    if (typeof self !== 'undefined' && !self.crossOriginIsolated) {
      console.warn(
        '[WASM] ⚠️ Page is NOT cross-origin isolated! SharedArrayBuffer unavailable.',
        'Ensure COOP/COEP headers are served.',
      );
    } else {
      console.log('[WASM] ✓ Cross-origin isolated — SharedArrayBuffer available');
    }

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
    console.log('[Linera] Step 1: Creating faucet...');
    const faucet = new lineraModule.Faucet(FAUCET_URL);

    // 2. Create wallet from faucet (fetches genesis config)
    console.log('[Linera] Step 2: Creating wallet from faucet...');
    const wallet = await faucet.createWallet();
    console.log('[Linera] Wallet created');

    // 3. Create or restore PrivateKey signer
    const stored = getStoredSession(evmAddress);
    let signer;
    let privateKeyHex: string;

    if (stored?.privateKeyHex) {
      // RESTORE: Same signer address as before
      console.log('[Linera] Step 3: Restoring PrivateKey signer from localStorage...');
      signer = new lineraModule.signer.PrivateKey(stored.privateKeyHex);
      privateKeyHex = stored.privateKeyHex;
      console.log('[Linera] Restored signer address:', signer.address());
    } else {
      // FIRST TIME: Generate random key and derive hex for storage
      console.log('[Linera] Step 3: Creating new PrivateKey signer...');
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
    console.log('[Linera] Step 4: Claiming chain from faucet...');
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
    console.log('[Linera] Step 5: Creating client...');
    lineraClient = await new lineraModule.Client(wallet, signer);
    console.log('[Linera] Client created');

    // 7. Get the Chain handle
    console.log('[Linera] Step 6: Getting chain handle...');
    lineraChain = await lineraClient.chain(userChainId);
    console.log('[Linera] Chain handle obtained');

    // 8. Get the Application handle for queries/mutations on player's chain
    if (APP_ID) {
      console.log('[Linera] Step 7: Getting application handle for:', APP_ID);
      lineraApp = await lineraChain.application(APP_ID);
      console.log('[Linera] Application handle obtained');
    }

    // 9. Get the Hub chain's application handle for tournament/leaderboard queries
    if (APP_ID && HUB_CHAIN_ID) {
      try {
        console.log('[Linera] Step 8: Getting Hub chain application handle...');
        const hubChain = await lineraClient.chain(HUB_CHAIN_ID);
        hubApp = await hubChain.application(APP_ID);
        console.log('[Linera] Hub application handle obtained');
      } catch (err) {
        console.warn('[Linera] Failed to get Hub app handle (will fall back to player chain):', err);
      }
    }

    console.log('[Linera] Connected successfully. Chain ID:', userChainId, 'Signer:', signerAddress);
    return { chainId: userChainId!, signerAddress: signerAddress! };
  } catch (err) {
    console.error('[Linera] Failed to connect:', err);
    throw err;
  }
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
 */
export async function queryHub(graphqlQuery: string, variables?: Record<string, unknown>): Promise<unknown> {
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

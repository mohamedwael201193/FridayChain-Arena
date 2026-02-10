// FridayChain Arena — Linera WASM Client Singleton
//
// Manages the connection between the browser and the Linera network.
// Uses @linera/client WASM module for trustless, fully client-side chain interaction.
// Architecture mirrors SignalSiege's proven AutoSigner + wasmInit pattern.
//
// Key design:
// - WASM module initialized once via ensureWasmInit()
// - AutoSigner: local PrivateKey in localStorage (no MetaMask per-tx popups)
// - wallet.setOwner() before Client creation (optimizes bytecode download)
// - Single timeout on Client creation (no retry loops)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lineraModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lineraClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lineraChain: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lineraApp: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hubApp: any = null;
let userChainId: string | null = null;
let signerAddress: string | null = null;
let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

// ── Configuration ────────────────────────────────────────────────────────

const FAUCET_URL =
  import.meta.env.VITE_FAUCET_URL || 'https://faucet.testnet-conway.linera.net';
const APP_ID = import.meta.env.VITE_APP_ID || '';
const HUB_CHAIN_ID = import.meta.env.VITE_HUB_CHAIN_ID || '';

// ── WASM Initialization (separated like SignalSiege) ─────────────────────

/**
 * Ensure WASM module is initialized exactly once.
 * Calling initialize() before importing classes is critical for Vercel.
 */
async function ensureWasmInit(): Promise<void> {
  if (wasmInitialized) return;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    console.log('[WASM] Initializing @linera/client...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linera: any = await import('@linera/client');
    if ('initialize' in linera && typeof linera.initialize === 'function') {
      console.log('[WASM] Calling initialize()...');
      await linera.initialize();
      console.log('[WASM] initialize() complete');
    }
    lineraModule = linera;
    wasmInitialized = true;
    console.log('[WASM] Initialization complete');
  })();

  await wasmInitPromise;
}

/**
 * Get the Linera module (ensuring WASM is loaded first).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLineraClient(): Promise<any> {
  if (lineraModule) return lineraModule;
  await ensureWasmInit();
  return lineraModule;
}

// ── Timeout Helper ───────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, operationName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${operationName} timed out after ${ms / 1000}s`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ── Session Persistence (AutoSigner pattern) ──────────────────────────────

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
  appId?: string;
}

function getStoredSession(evmAddress: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY + '_' + evmAddress.toLowerCase());
    if (!raw) return null;
    const session: StoredSession = JSON.parse(raw);
    if (session.appId && session.appId !== APP_ID) {
      console.log('[Linera] App ID changed — keeping signer key, clearing registration for', evmAddress);
      session.appId = APP_ID;
      session.registeredAt = undefined;
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
 * Initialize the Linera WASM module. Safe to call multiple times.
 */
export async function initLinera(): Promise<void> {
  await ensureWasmInit();
}

/**
 * Connect to the Linera network using AutoSigner pattern:
 * 1. WASM init (if not already done)
 * 2. Faucet → Wallet
 * 3. Create/restore PrivateKey AutoSigner
 * 4. Claim chain
 * 5. wallet.setOwner(chainId, signerAddress) — CRITICAL for bytecode download
 * 6. Create Client (downloads application bytecodes)
 * 7. Get Chain + App handles
 * 8. Connect Hub chain
 */
export async function connectToLinera(evmAddress: string): Promise<{ chainId: string; signerAddress: string }> {
  // Step 1: Ensure WASM is ready
  reportProgress('Initializing WASM module...');
  const mod = await getLineraClient();

  try {
    // Step 2: Connect to faucet
    reportProgress('Connecting to Linera faucet...');
    const faucet = new mod.Faucet(FAUCET_URL);
    console.log('[Linera] Faucet connected');

    // Step 3: Create wallet from faucet
    reportProgress('Creating wallet...');
    const wallet = await faucet.createWallet();
    console.log('[Linera] Wallet created');

    // Step 4: Create or restore AutoSigner (PrivateKey)
    const stored = getStoredSession(evmAddress);
    let signer;
    let privateKeyHex: string;

    if (stored?.privateKeyHex) {
      reportProgress('Restoring your identity...');
      signer = new mod.signer.PrivateKey(stored.privateKeyHex);
      privateKeyHex = stored.privateKeyHex;
      console.log('[Linera] Restored signer address:', signer.address());
    } else {
      reportProgress('Creating new blockchain identity...');
      // Use SDK's native createRandom() for proper key generation
      signer = mod.signer.PrivateKey.createRandom();
      privateKeyHex = signer.toString();
      console.log('[Linera] New signer address:', signer.address());
    }

    const owner = signer.address();
    signerAddress = owner.toString();

    // Step 5: Claim a microchain
    reportProgress('Claiming your microchain...');
    const chainId = await withTimeout(
      faucet.claimChain(wallet, owner),
      30_000,
      'Chain claiming',
    ) as string;
    userChainId = chainId.toString();
    console.log('[Linera] Chain claimed:', userChainId);

    // Step 6: Register AutoSigner in wallet (CRITICAL — from SignalSiege)
    // This tells the wallet which chain this signer owns, optimizing bytecode download
    reportProgress('Registering signer in wallet...');
    if (typeof wallet.setOwner === 'function') {
      await wallet.setOwner(userChainId, signerAddress);
      console.log('[Linera] Auto-signer registered in wallet');
    } else {
      console.log('[Linera] wallet.setOwner not available, skipping');
    }

    // Step 7: Persist session
    storeSession({
      privateKeyHex,
      signerAddress: signerAddress!,
      evmAddress,
      discordUsername: stored?.discordUsername,
      registeredAt: stored?.registeredAt,
      appId: APP_ID,
    });

    // Step 8: Create Linera Client (downloads bytecodes from validators)
    reportProgress('Syncing with blockchain validators (this may take up to 45s)...');
    const startTime = Date.now();

    // Show elapsed time every 10 seconds
    const progressInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      reportProgress(`Syncing with validators... ${elapsed}s`);
    }, 10_000);

    try {
      // Create client — pass raw signer for auto-signing
      const createClientPromise = (async () => {
        let newClient = new mod.Client(wallet, signer);
        if (newClient instanceof Promise) {
          newClient = await newClient;
        }
        return newClient;
      })();

      lineraClient = await withTimeout(createClientPromise, 45_000, 'Client creation');
      clearInterval(progressInterval);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[Linera] Client created in ${elapsed}s`);
    } catch (timeoutError) {
      clearInterval(progressInterval);
      console.error('[Linera] Client creation timeout:', timeoutError);
      throw new Error(
        'Connection to Linera testnet timed out. The validators may be experiencing high load. Please refresh and try again.',
      );
    }

    // Step 9: Sync chain (non-fatal if it fails with some validators)
    reportProgress('Connecting to your chain...');
    try {
      if (typeof lineraClient.chain === 'function') {
        lineraChain = await withTimeout(
          lineraClient.chain(userChainId),
          60_000,
          'Chain sync',
        );
        console.log('[Linera] Chain synced');
      } else if (typeof lineraClient.getChain === 'function') {
        lineraChain = await withTimeout(
          lineraClient.getChain(userChainId),
          60_000,
          'Chain sync',
        );
        console.log('[Linera] Chain synced (getChain)');
      }
    } catch (syncError) {
      console.warn('[Linera] Chain sync warning (non-fatal):', syncError);
    }

    // Step 10: Get Application handle
    if (APP_ID && lineraChain) {
      reportProgress('Loading application...');
      lineraApp = await withTimeout(
        lineraChain.application(APP_ID),
        60_000,
        'Application handle',
      );
      console.log('[Linera] Application handle obtained');
    }

    // Step 11: Connect to Hub chain (synchronous — no fallback)
    if (APP_ID && HUB_CHAIN_ID && lineraClient) {
      reportProgress('Connecting to tournament hub...');
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let hubChain: any;
        if (typeof lineraClient.chain === 'function') {
          hubChain = await withTimeout(
            lineraClient.chain(HUB_CHAIN_ID),
            60_000,
            'Hub chain sync',
          );
        } else if (typeof lineraClient.getChain === 'function') {
          hubChain = await withTimeout(
            lineraClient.getChain(HUB_CHAIN_ID),
            60_000,
            'Hub chain sync',
          );
        }
        if (hubChain) {
          hubApp = await withTimeout(
            hubChain.application(APP_ID),
            60_000,
            'Hub application handle',
          );
          console.log('[Linera] Hub application handle obtained');
        }
      } catch (hubErr) {
        console.warn('[Linera] Hub connection warning (non-fatal):', hubErr);
        // Hub fails gracefully — queries will fall through to player chain
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
 * Tournament data, leaderboard, and puzzle boards live on the Hub chain.
 * Falls back to player's chain app handle if hub is unavailable.
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


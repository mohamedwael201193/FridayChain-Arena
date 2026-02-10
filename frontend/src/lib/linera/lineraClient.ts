// FridayChain Arena — Linera WASM Client Singleton
//
// TWO-PHASE CONNECTION ARCHITECTURE:
//
// Like SignalSiege, we split the connection into two phases:
//
// Phase 1 (FAST — 2-5s): Identity
//   WASM init → wallet → signer → claimChain → wallet.setOwner
//   → Returns chainId + signerAddress → UI shows "Connected!"
//
// Phase 2 (SLOW — runs silently in background):
//   new Client(wallet, signer) → chain handle → app handle → hub handle
//   → Completes in background. query/mutate wait for this if needed.
//
// This means the user sees "Connected" in 2-5 seconds (same as local!),
// and the heavy validator sync happens transparently in the background.
// The first actual blockchain query may take a few extra seconds,
// but the user can already navigate the UI.

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Module-level state ───────────────────────────────────────────────────

let lineraApp: any = null;
let hubApp: any = null;
let userChainId: string | null = null;
let signerAddress: string | null = null;

// ── Configuration ────────────────────────────────────────────────────────

const FAUCET_URL =
  import.meta.env.VITE_FAUCET_URL || 'https://faucet.testnet-conway.linera.net';
const APP_ID = import.meta.env.VITE_APP_ID || '';
const HUB_CHAIN_ID = import.meta.env.VITE_HUB_CHAIN_ID || '';

// ── WASM Initialization ─────────────────────────────────────────────────

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;
let lineraModule: any = null;

async function ensureWasmInit(): Promise<void> {
  if (wasmInitialized) return;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    console.log('[WASM] Initializing @linera/client...');
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

// ── Progress Reporting ───────────────────────────────────────────────────

type ProgressCallback = (step: string) => void;
let _onProgress: ProgressCallback | null = null;

export function setProgressCallback(cb: ProgressCallback | null): void {
  _onProgress = cb;
}

function reportProgress(step: string): void {
  console.log(`[Linera] ${step}`);
  if (_onProgress) _onProgress(step);
}

// ── Session Persistence ──────────────────────────────────────────────────

const SESSION_STORAGE_KEY = 'fridaychain_arena_session';

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
      console.log('[Linera] App ID changed — clearing registration for', evmAddress);
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

export function persistPlayerRegistration(evmAddress: string, discordUsername: string): void {
  const session = getStoredSession(evmAddress);
  if (session) {
    session.discordUsername = discordUsername;
    session.registeredAt = String(Date.now() * 1000);
    storeSession(session);
  }
}

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

// ── Two-Phase Pre-Warm ───────────────────────────────────────────────────
//
// Phase 1 (FAST): Identity setup — wallet, signer, chain claim
//   Completes in 2-5 seconds. This is all we need to show "connected".
//
// Phase 2 (SLOW): Heavy init — Client creation, chain/app handles
//   Runs in background AFTER Phase 1. Takes 30-45s on testnet.
//   query() and mutate() wait for this silently.

interface Phase1Result {
  mod: any;
  wallet: any;
  signer: any;       // Raw PrivateKey SDK object
  owner: any;        // Raw Address SDK object from signer.address()
  chainId: any;      // Raw ChainId SDK object from claimChain()
  chainIdStr: string;
  signerAddressStr: string;
  faucet: any;
}

interface Phase2Result {
  client: any;
  chain: any;
  app: any;
  hubApp: any;
}

let phase1Promise: Promise<Phase1Result | null> | null = null;
let phase1Result: Phase1Result | null = null;

let phase2Promise: Promise<Phase2Result | null> | null = null;
let phase2Result: Phase2Result | null = null;

/**
 * Phase 1: Fast identity setup (2-5 seconds)
 * - Init WASM
 * - Create Faucet + Wallet
 * - Generate fresh PrivateKey signer
 * - Claim microchain
 * - Register signer in wallet
 */
async function runPhase1(): Promise<Phase1Result | null> {
  try {
    console.log('[Linera] Phase 1: Starting identity setup...');

    // 1. Init WASM
    const mod = await getLineraClient();

    // 2. Create faucet + wallet
    const faucet = new mod.Faucet(FAUCET_URL);
    const wallet = await faucet.createWallet();
    console.log('[Linera] Phase 1: Wallet created');

    // 3. Fresh PrivateKey (like SignalSiege — always fresh)
    const signer = mod.signer.PrivateKey.createRandom();
    const owner = signer.address(); // Raw SDK Address object
    const signerAddressStr = owner.toString();
    console.log('[Linera] Phase 1: Signer ready:', signerAddressStr);

    // 4. Claim chain
    const chainId: any = await withTimeout(
      faucet.claimChain(wallet, owner),
      30_000,
      'Chain claiming',
    );
    const chainIdStr = chainId.toString();
    console.log('[Linera] Phase 1: Chain claimed:', chainIdStr);

    // 5. Register signer in wallet — pass RAW SDK objects
    if (typeof wallet.setOwner === 'function') {
      await wallet.setOwner(chainId, owner);
      console.log('[Linera] Phase 1: Signer registered in wallet');
    }

    const result: Phase1Result = {
      mod, wallet, signer, owner, chainId, chainIdStr, signerAddressStr, faucet,
    };

    console.log('[Linera] Phase 1 COMPLETE — identity ready!');
    return result;
  } catch (err) {
    console.warn('[Linera] Phase 1 failed:', err);
    return null;
  }
}

/**
 * Phase 2: Heavy initialization (30-45 seconds, runs in background)
 * - Create Client (downloads application bytecodes from validators)
 * - Get chain handle
 * - Get app handle
 * - Get hub app handle
 */
async function runPhase2(p1: Phase1Result): Promise<Phase2Result | null> {
  try {
    console.log('[Linera] Phase 2: Creating client (background sync with validators)...');

    // 1. Create Client — THE SLOW PART
    let client = new p1.mod.Client(p1.wallet, p1.signer);
    if (client instanceof Promise) {
      client = await client;
    }
    console.log('[Linera] Phase 2: Client created!');

    // 2. Get chain handle
    let chain = null;
    if (typeof client.chain === 'function') {
      chain = await client.chain(p1.chainIdStr);
    } else if (typeof client.getChain === 'function') {
      chain = await client.getChain(p1.chainIdStr);
    }
    console.log('[Linera] Phase 2: Chain handle obtained');

    // 3. Get app handle
    let app = null;
    if (APP_ID && chain) {
      app = await chain.application(APP_ID);
      console.log('[Linera] Phase 2: Application handle obtained');
    }

    // 4. Get hub app handle
    let hub = null;
    if (APP_ID && HUB_CHAIN_ID && client) {
      try {
        let hubChain;
        if (typeof client.chain === 'function') {
          hubChain = await client.chain(HUB_CHAIN_ID);
        } else if (typeof client.getChain === 'function') {
          hubChain = await client.getChain(HUB_CHAIN_ID);
        }
        if (hubChain) {
          hub = await hubChain.application(APP_ID);
          console.log('[Linera] Phase 2: Hub handle obtained');
        }
      } catch (hubErr) {
        console.warn('[Linera] Phase 2: Hub connection failed (non-fatal):', hubErr);
      }
    }

    const result: Phase2Result = { client, chain, app, hubApp: hub };
    console.log('[Linera] Phase 2 COMPLETE — fully operational!');
    return result;
  } catch (err) {
    console.warn('[Linera] Phase 2 failed:', err);
    return null;
  }
}

/**
 * Start pre-warming on page load.
 * Phase 1 runs immediately.
 * Phase 2 starts automatically after Phase 1 completes.
 */
function startPreWarm(): void {
  if (phase1Promise) return;

  // Start Phase 1
  phase1Promise = runPhase1().then((result) => {
    phase1Result = result;

    // Automatically kick off Phase 2 in background (fire-and-forget)
    if (result) {
      phase2Promise = runPhase2(result).then((p2) => {
        phase2Result = p2;
        // Assign module-level handles so query/mutate can use them
        if (p2) {
          lineraApp = p2.app;
          hubApp = p2.hubApp;
        }
        return p2;
      });
    }

    return result;
  });
}

// FIRE IMMEDIATELY ON MODULE IMPORT — starts identity setup right away
startPreWarm();

// ── Public API: Initialization ───────────────────────────────────────────

export async function initLinera(): Promise<void> {
  await ensureWasmInit();
}

// ── Public API: Connect ──────────────────────────────────────────────────

/**
 * Connect to the Linera network.
 *
 * Only waits for Phase 1 (identity — 2-5s). Returns as soon as we have
 * chainId + signerAddress. Phase 2 (Client+handles) continues in background.
 *
 * This matches SignalSiege's pattern where connection returns quickly
 * and app handles are resolved lazily on first query/mutate.
 */
export async function connectToLinera(evmAddress: string): Promise<{ chainId: string; signerAddress: string }> {
  // ── Wait for Phase 1 (fast) ────────────────────────────────────────

  if (phase1Promise) {
    if (!phase1Result) {
      // Phase 1 still running — wait for it (should be fast, 2-5s)
      reportProgress('Connecting to Linera network...');
      await phase1Promise;
    }

    if (phase1Result) {
      // Phase 1 succeeded — assign identity and return IMMEDIATELY
      userChainId = phase1Result.chainIdStr;
      signerAddress = phase1Result.signerAddressStr;

      const privateKeyHex = phase1Result.signer.toString();

      // Preserve username from any previous session for this MetaMask address
      const stored = getStoredSession(evmAddress);
      storeSession({
        privateKeyHex,
        signerAddress: signerAddress!,
        evmAddress,
        discordUsername: stored?.discordUsername,
        registeredAt: stored?.registeredAt,
        appId: APP_ID,
      });

      reportProgress('Connected!');
      console.log('[Linera] Connected! Chain:', userChainId, 'Signer:', signerAddress);
      console.log('[Linera] Phase 2 (app handles) running in background...');
      return { chainId: userChainId!, signerAddress: signerAddress! };
    }
  }

  // ── Fallback: Phase 1 failed or didn't start — do it now ──────────

  reportProgress('Connecting to Linera network...');
  const p1 = await runPhase1();

  if (!p1) {
    throw new Error('Failed to connect to Linera network. Please refresh and try again.');
  }

  phase1Result = p1;
  userChainId = p1.chainIdStr;
  signerAddress = p1.signerAddressStr;

  const privateKeyHex = p1.signer.toString();
  const stored = getStoredSession(evmAddress);
  storeSession({
    privateKeyHex,
    signerAddress: signerAddress!,
    evmAddress,
    discordUsername: stored?.discordUsername,
    registeredAt: stored?.registeredAt,
    appId: APP_ID,
  });

  // Start Phase 2 in background
  phase2Promise = runPhase2(p1).then((p2) => {
    phase2Result = p2;
    if (p2) {
      lineraApp = p2.app;
      hubApp = p2.hubApp;
    }
    return p2;
  });

  reportProgress('Connected!');
  console.log('[Linera] Connected! Chain:', userChainId, 'Signer:', signerAddress);
  return { chainId: userChainId!, signerAddress: signerAddress! };
}

// ── Ensure Phase 2 is ready (for queries/mutations) ──────────────────────

/**
 * Wait for Phase 2 to complete. Called internally before any query/mutate.
 * If Phase 2 hasn't started yet, starts it now.
 * Shows progress only if Phase 2 is not yet done.
 */
async function ensureAppReady(): Promise<void> {
  // Already have app handle — nothing to do
  if (lineraApp) return;

  // Phase 2 exists, wait for it
  if (phase2Promise) {
    if (!phase2Result) {
      reportProgress('Loading application...');
    }
    await phase2Promise;
    if (phase2Result) {
      lineraApp = phase2Result.app;
      hubApp = phase2Result.hubApp;
    }
    if (lineraApp) return;
  }

  // Phase 2 doesn't exist yet — need to start it
  if (phase1Result && !phase2Promise) {
    reportProgress('Loading application...');
    phase2Promise = runPhase2(phase1Result).then((p2) => {
      phase2Result = p2;
      if (p2) {
        lineraApp = p2.app;
        hubApp = p2.hubApp;
      }
      return p2;
    });
    await phase2Promise;
    if (lineraApp) return;
  }

  throw new Error('Application not ready. Please reconnect.');
}

// ── Queries & Mutations ──────────────────────────────────────────────────

function gql(queryStr: string, variables: Record<string, unknown> = {}): string {
  return JSON.stringify({ query: queryStr, variables });
}

export async function query(graphqlQuery: string, variables?: Record<string, unknown>): Promise<unknown> {
  if (!userChainId) {
    throw new Error('Linera client not connected. Call connectToLinera() first.');
  }
  await ensureAppReady();

  const request = gql(graphqlQuery, variables);
  const response = await lineraApp.query(request);
  const parsed = typeof response === 'string' ? JSON.parse(response) : response;
  if (parsed.errors?.length > 0) {
    console.error('[Linera] Query errors:', parsed.errors);
    throw new Error(parsed.errors[0].message || 'GraphQL query failed');
  }
  return parsed.data;
}

export async function mutate(graphqlMutation: string, variables?: Record<string, unknown>): Promise<unknown> {
  if (!userChainId) {
    throw new Error('Linera client not connected. Call connectToLinera() first.');
  }
  await ensureAppReady();

  const request = gql(graphqlMutation, variables);
  console.log('[Linera] Sending mutation:', request);
  try {
    const response = await lineraApp.query(request);
    console.log('[Linera] Mutation raw response:', response);
    const parsed = typeof response === 'string' ? JSON.parse(response) : response;
    if (parsed.errors?.length > 0) {
      console.error('[Linera] Mutation errors:', parsed.errors);
      throw new Error(parsed.errors[0].message || 'GraphQL mutation failed');
    }
    return parsed.data;
  } catch (err) {
    console.error('[Linera] Mutation failed:', err);
    throw err;
  }
}

export async function queryHub(graphqlQuery: string, variables?: Record<string, unknown>): Promise<unknown> {
  if (!userChainId) {
    throw new Error('Linera client not connected. Call connectToLinera() first.');
  }
  await ensureAppReady();

  const appHandle = hubApp || lineraApp;
  if (!appHandle) {
    throw new Error('Application not ready.');
  }
  const request = gql(graphqlQuery, variables);
  const response = await appHandle.query(request);
  const parsed = typeof response === 'string' ? JSON.parse(response) : response;
  if (parsed.errors?.length > 0) {
    console.error('[Linera] Hub query errors:', parsed.errors);
    throw new Error(parsed.errors[0].message || 'Hub GraphQL query failed');
  }
  return parsed.data;
}

export async function queryChain(chainId: string, graphqlQuery: string, variables?: Record<string, unknown>): Promise<unknown> {
  if (chainId === HUB_CHAIN_ID) return queryHub(graphqlQuery, variables);
  return query(graphqlQuery, variables);
}

// ── Notification Listener ────────────────────────────────────────────────

export function onNotification(callback: (notification: unknown) => void): void {
  // If Phase 2 isn't done yet, defer the notification listener setup
  if (!phase2Result?.chain) {
    // Wait for Phase 2 and retry
    if (phase2Promise) {
      phase2Promise.then(() => {
        if (phase2Result?.chain) {
          try {
            phase2Result.chain.onNotification((notification: unknown) => {
              callback(notification);
            });
          } catch (err) {
            console.warn('[Linera] Failed to register notification listener:', err);
          }
        }
      });
    }
    return;
  }

  try {
    phase2Result.chain.onNotification((notification: unknown) => {
      callback(notification);
    });
  } catch (err) {
    console.warn('[Linera] Failed to register notification listener:', err);
  }
}

// ── Getters ──────────────────────────────────────────────────────────────

export function getChainId(): string | null { return userChainId; }
export function getAppId(): string { return APP_ID; }
export function getHubChainId(): string { return HUB_CHAIN_ID; }
export function getSignerAddress(): string | null { return signerAddress; }

/**
 * Check if connected — returns true as soon as Phase 1 is done
 * (we have chainId and signerAddress). Phase 2 may still be running.
 */
export function isConnected(): boolean {
  return userChainId !== null && signerAddress !== null;
}

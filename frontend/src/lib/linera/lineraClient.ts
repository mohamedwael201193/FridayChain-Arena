// FridayChain Arena — Linera WASM Client Singleton
//
// PRE-WARM ARCHITECTURE:
// The slow part of connecting is `new Client(wallet, signer)` which downloads
// application bytecodes from Conway validators (30-45s). We start this
// IMMEDIATELY when the page loads — before the user even clicks Connect.
// By the time they click Connect and confirm MetaMask, the Client is ready.
//
// Flow:
//   Page load → startPreWarm() → WASM init → Wallet → Chain → Client (background)
//   User clicks Connect → MetaMask → await preWarm → use pre-created client (instant!)

/* eslint-disable @typescript-eslint/no-explicit-any */

let lineraClient: any = null;
let lineraChain: any = null;
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

// ── Pre-Warm: Start Connection on Page Load ──────────────────────────────
//
// This is THE KEY optimization. We start creating the Linera Client
// immediately when the page loads (before the user clicks anything).
// The Client constructor downloads bytecodes from Conway validators which
// takes 30-45s. By starting early, the user's "reading time" on
// the landing page absorbs most of this wait.

interface PreWarmResult {
  mod: any;
  wallet: any;
  signer: any;       // Raw PrivateKey SDK object
  owner: any;        // Raw Address SDK object from signer.address()
  chainId: any;      // Raw ChainId SDK object from claimChain()
  chainIdStr: string;
  client: any;
  chain: any;
  app: any;
  hubApp: any;
}

let preWarmPromise: Promise<void> | null = null;
let preWarmResult: PreWarmResult | null = null;

function startPreWarm(): void {
  if (preWarmPromise) return;

  preWarmPromise = (async () => {
    try {
      console.log('[Linera] Pre-warming connection in background...');

      // 1. Init WASM
      const mod = await getLineraClient();

      // 2. Create faucet + wallet
      const faucet = new mod.Faucet(FAUCET_URL);
      const wallet = await faucet.createWallet();
      console.log('[Linera] Pre-warm: Wallet created');

      // 3. Fresh PrivateKey (like SignalSiege — always fresh for Client)
      const signer = mod.signer.PrivateKey.createRandom();
      const owner = signer.address(); // Raw SDK Address object
      console.log('[Linera] Pre-warm: Signer ready');

      // 4. Claim chain
      const chainId = await faucet.claimChain(wallet, owner);
      const chainIdStr = chainId.toString();
      console.log('[Linera] Pre-warm: Chain claimed:', chainIdStr);

      // 5. Register signer in wallet — pass RAW SDK objects (not strings!)
      //    This is critical: tells the WASM client which chain this signer owns,
      //    which optimizes the bytecode download during Client creation.
      if (typeof wallet.setOwner === 'function') {
        await wallet.setOwner(chainId, owner);
        console.log('[Linera] Pre-warm: Signer registered in wallet');
      }

      // 6. Create Client — THE SLOW PART — runs in background while user reads page
      console.log('[Linera] Pre-warm: Creating client (downloading bytecodes)...');
      let client = new mod.Client(wallet, signer);
      if (client instanceof Promise) {
        client = await client;
      }
      console.log('[Linera] Pre-warm: Client created!');

      // 7. Get chain handle
      let chain = null;
      if (typeof client.chain === 'function') {
        chain = await client.chain(chainIdStr);
      } else if (typeof client.getChain === 'function') {
        chain = await client.getChain(chainIdStr);
      }
      console.log('[Linera] Pre-warm: Chain handle obtained');

      // 8. Get app handle
      let app = null;
      if (APP_ID && chain) {
        app = await chain.application(APP_ID);
        console.log('[Linera] Pre-warm: Application handle obtained');
      }

      // 9. Get hub app handle
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
            console.log('[Linera] Pre-warm: Hub handle obtained');
          }
        } catch (hubErr) {
          console.warn('[Linera] Pre-warm: Hub connection failed (non-fatal):', hubErr);
        }
      }

      preWarmResult = {
        mod, wallet, signer, owner,
        chainId, chainIdStr,
        client, chain, app, hubApp: hub,
      };

      console.log('[Linera] Pre-warm COMPLETE! Ready for instant connect.');
    } catch (err) {
      console.warn('[Linera] Pre-warm failed (will do full connect on demand):', err);
      preWarmPromise = null; // Allow manual connection to try
    }
  })();
}

// FIRE IMMEDIATELY ON MODULE IMPORT — this is the magic
startPreWarm();

// ── Public API: Initialization ───────────────────────────────────────────

export async function initLinera(): Promise<void> {
  await ensureWasmInit();
}

// ── Public API: Connect ──────────────────────────────────────────────────

/**
 * Connect to the Linera network.
 *
 * If pre-warm completed → instant (just assigns the pre-created handles).
 * If pre-warm still running → waits for it (with progress updates).
 * If pre-warm failed → does full connection from scratch.
 */
export async function connectToLinera(evmAddress: string): Promise<{ chainId: string; signerAddress: string }> {
  // ── Try to use pre-warmed connection ───────────────────────────────

  if (preWarmPromise) {
    if (!preWarmResult) {
      // Pre-warm still running — wait with progress
      reportProgress('Syncing with blockchain validators...');
      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        reportProgress(`Syncing with validators... ${elapsed}s`);
      }, 10_000);

      try {
        await preWarmPromise;
      } finally {
        clearInterval(progressInterval);
      }
    }

    if (preWarmResult) {
      // Pre-warm succeeded — use everything (near-instant!)
      reportProgress('Finalizing connection...');

      lineraClient = preWarmResult.client;
      lineraChain = preWarmResult.chain;
      lineraApp = preWarmResult.app;
      hubApp = preWarmResult.hubApp;
      userChainId = preWarmResult.chainIdStr;
      signerAddress = preWarmResult.owner.toString();

      const privateKeyHex = preWarmResult.signer.toString();

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

      console.log('[Linera] Connected (pre-warmed). Chain:', userChainId, 'Signer:', signerAddress);
      return { chainId: userChainId!, signerAddress: signerAddress! };
    }
  }

  // ── Fallback: Full connection from scratch ─────────────────────────

  reportProgress('Initializing connection...');
  const mod = await getLineraClient();

  try {
    reportProgress('Connecting to Linera faucet...');
    const faucet = new mod.Faucet(FAUCET_URL);

    reportProgress('Creating wallet...');
    const wallet = await faucet.createWallet();
    console.log('[Linera] Wallet created');

    reportProgress('Creating blockchain identity...');
    const signer = mod.signer.PrivateKey.createRandom();
    const owner = signer.address();
    signerAddress = owner.toString();
    console.log('[Linera] Signer address:', signerAddress);

    reportProgress('Claiming your microchain...');
    const chainId: any = await withTimeout(
      faucet.claimChain(wallet, owner),
      30_000,
      'Chain claiming',
    );
    userChainId = chainId.toString();
    console.log('[Linera] Chain claimed:', userChainId);

    // Register signer — pass RAW SDK objects (not strings!)
    if (typeof wallet.setOwner === 'function') {
      await wallet.setOwner(chainId, owner);
      console.log('[Linera] Signer registered in wallet');
    }

    const privateKeyHex = signer.toString();
    const stored = getStoredSession(evmAddress);
    storeSession({
      privateKeyHex,
      signerAddress: signerAddress!,
      evmAddress,
      discordUsername: stored?.discordUsername,
      registeredAt: stored?.registeredAt,
      appId: APP_ID,
    });

    reportProgress('Syncing with blockchain validators...');
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      reportProgress(`Syncing with validators... ${elapsed}s`);
    }, 10_000);

    try {
      const createClientPromise = (async () => {
        let newClient = new mod.Client(wallet, signer);
        if (newClient instanceof Promise) newClient = await newClient;
        return newClient;
      })();
      lineraClient = await withTimeout(createClientPromise, 120_000, 'Client creation');
      clearInterval(progressInterval);
      console.log(`[Linera] Client created in ${Math.round((Date.now() - startTime) / 1000)}s`);
    } catch (timeoutError) {
      clearInterval(progressInterval);
      throw new Error('Connection timed out. Please refresh and try again.');
    }

    reportProgress('Connecting to your chain...');
    if (typeof lineraClient.chain === 'function') {
      lineraChain = await lineraClient.chain(userChainId);
    } else if (typeof lineraClient.getChain === 'function') {
      lineraChain = await lineraClient.getChain(userChainId);
    }

    if (APP_ID && lineraChain) {
      reportProgress('Loading application...');
      lineraApp = await lineraChain.application(APP_ID);
    }

    if (APP_ID && HUB_CHAIN_ID && lineraClient) {
      reportProgress('Connecting to tournament hub...');
      try {
        let hubChain;
        if (typeof lineraClient.chain === 'function') {
          hubChain = await lineraClient.chain(HUB_CHAIN_ID);
        } else if (typeof lineraClient.getChain === 'function') {
          hubChain = await lineraClient.getChain(HUB_CHAIN_ID);
        }
        if (hubChain) {
          hubApp = await hubChain.application(APP_ID);
        }
      } catch (hubErr) {
        console.warn('[Linera] Hub connection failed (non-fatal):', hubErr);
      }
    }

    console.log('[Linera] Connected (fresh). Chain:', userChainId, 'Signer:', signerAddress);
    return { chainId: userChainId!, signerAddress: signerAddress! };
  } catch (err) {
    console.error('[Linera] Connection failed:', err);
    throw err;
  }
}

// ── Queries & Mutations ──────────────────────────────────────────────────

function gql(queryStr: string, variables: Record<string, unknown> = {}): string {
  return JSON.stringify({ query: queryStr, variables });
}

export async function query(graphqlQuery: string, variables?: Record<string, unknown>): Promise<unknown> {
  assertConnected();
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
  assertConnected();
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
  const appHandle = hubApp || lineraApp;
  if (!appHandle) {
    throw new Error('Linera client not connected. Call connectToLinera() first.');
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

export function getChainId(): string | null { return userChainId; }
export function getAppId(): string { return APP_ID; }
export function getHubChainId(): string { return HUB_CHAIN_ID; }
export function getSignerAddress(): string | null { return signerAddress; }
export function isConnected(): boolean { return lineraChain !== null && userChainId !== null; }

// ── Internal ─────────────────────────────────────────────────────────────

function assertConnected(): void {
  if (!lineraApp || !userChainId) {
    throw new Error('Linera client not connected. Call connectToLinera() first.');
  }
}
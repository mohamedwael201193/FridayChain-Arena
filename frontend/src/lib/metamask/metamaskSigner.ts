// FridayChain Arena — MetaMask Wallet Connection
//
// Handles MetaMask connection and account management.
// The Linera Signer implementation is in lineraClient.ts.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
  }
}

export interface MetaMaskAccount {
  address: string;
}

/**
 * Check if MetaMask is installed in the browser.
 */
export function isMetaMaskInstalled(): boolean {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
}

/**
 * Request MetaMask account connection.
 * Returns the connected EVM address.
 */
export async function connectMetaMask(): Promise<MetaMaskAccount> {
  if (!isMetaMaskInstalled()) {
    throw new Error(
      'MetaMask is not installed. Please install MetaMask to use FridayChain Arena.',
    );
  }

  try {
    const accounts: string[] = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });

    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts returned from MetaMask');
    }

    return { address: accounts[0] };
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    if (error.code === 4001) {
      throw new Error('MetaMask connection rejected by user');
    }
    throw err;
  }
}

/**
 * Get the currently connected MetaMask account (without prompting).
 */
export async function getMetaMaskAccount(): Promise<MetaMaskAccount | null> {
  if (!isMetaMaskInstalled()) return null;

  try {
    const accounts: string[] = await window.ethereum.request({
      method: 'eth_accounts',
    });

    if (!accounts || accounts.length === 0) return null;
    return { address: accounts[0] };
  } catch {
    return null;
  }
}

/**
 * Listen for MetaMask account changes.
 */
export function onAccountChanged(callback: (accounts: string[]) => void): void {
  if (isMetaMaskInstalled()) {
    window.ethereum.on('accountsChanged', callback);
  }
}

/**
 * Listen for MetaMask chain changes.
 */
export function onChainChanged(callback: (chainId: string) => void): void {
  if (isMetaMaskInstalled()) {
    window.ethereum.on('chainChanged', callback);
  }
}

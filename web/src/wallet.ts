export interface WalletProviderInfo {
  id: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
}

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export const GENLAYER_CHAIN = {
  chainId: '0xF22D',
  chainName: 'GenLayer Studio Next / Studio-dev',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: ['https://studio-dev.genlayer.com/api'],
  blockExplorerUrls: ['https://explorer-studio-dev.genlayer.com/'],
};

export function discoverWallets(timeout = 250): Promise<WalletProviderInfo[]> {
  return new Promise((resolve) => {
    const found = new Map<string, WalletProviderInfo>();
    function onAnnounce(event: Event) {
      const detail = (event as CustomEvent<{ info: { uuid: string; name: string; rdns?: string; icon?: string }; provider: Eip1193Provider }>).detail;
      if (detail?.provider && detail.info) {
        const id = detail.info.rdns || detail.info.name;
        found.set(id, { id, name: detail.info.name, icon: detail.info.icon, provider: detail.provider });
      }
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    window.setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      if (window.ethereum) {
        const isMetaMaskAlready = [...found.values()].some(p => p.provider === window.ethereum || (window.ethereum?.isMetaMask && p.name === 'MetaMask'));
        if (!isMetaMaskAlready) {
          found.set('window.ethereum', { id: 'window.ethereum', name: window.ethereum.isMetaMask ? 'MetaMask' : 'Injected wallet', provider: window.ethereum });
        }
      }
      resolve([...found.values()]);
    }, timeout);
  });
}


import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { DemoAdapter } from './demoAdapter';
import { LiveAdapter } from './liveAdapter';
import type { DataAdapter, DemoIdentity, ScopeGateState } from './domain';
import { discoverWallets, type Eip1193Provider } from './wallet';

export type AppMode = 'demo' | 'live';

export interface WalletState {
  provider?: Eip1193Provider;
  account?: string;
  chainId?: string;
  providerName?: string;
  providerId?: string;
  isRestoring?: boolean;
}

export interface TxState {
  status: 'idle' | 'estimating' | 'confirm' | 'wallet' | 'finalizing' | 'success' | 'error' | 'pending';
  actionName?: string;
  feeValue?: bigint;
  hash?: string;
  errorMessage?: string;
  resolve?: (confirm: boolean) => void;
}

interface StoreContextValue {
  state: ScopeGateState | null;
  adapter: DataAdapter;
  error: string | null;
  isLoading: boolean;
  mode: AppMode;
  wallet: WalletState;
  txState: TxState;
  liveDeploymentAddress?: string;
  setError(error: string | null): void;
  setTxState: Dispatch<SetStateAction<TxState>>;
  refresh(): Promise<void>;
  run<T>(operation: (adapter: DataAdapter) => Promise<T>): Promise<T | null>;
  setIdentity(identity: DemoIdentity): Promise<void>;
  setMode(mode: AppMode): Promise<void>;
  setWallet(wallet: WalletState): Promise<void>;
  loadScope(scope: 'workspaces' | 'workspaceDetails' | 'actions' | 'board', id?: string): Promise<void>;
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(() => (localStorage.getItem('scopegate-mode') as AppMode) || 'demo');
  const [wallet, setWalletState] = useState<WalletState>({ isRestoring: !!localStorage.getItem('scopegate-wallet-id') });
  const [txState, setTxState] = useState<TxState>({ status: 'idle' });
  const liveDeploymentAddress = import.meta.env.VITE_SCOPEGATE_CONTRACT_ADDRESS as string | undefined;
  const adapter = useMemo<DataAdapter>(
    () => (mode === 'live' ? new LiveAdapter(() => wallet, () => liveDeploymentAddress, setTxState) : new DemoAdapter()),
    [mode, wallet, liveDeploymentAddress],
  );
  const [state, setState] = useState<ScopeGateState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const lastProviderId = localStorage.getItem('scopegate-wallet-id');
    if (!lastProviderId) return;
    let mounted = true;
    let deadlinePassed = false;
    let success = false;
    let currentlyChecking = false;

    const restoreTimeout = setTimeout(() => {
      deadlinePassed = true;
      if (mounted && !success) {
        setWalletState((prev) => ({ ...prev, isRestoring: false }));
      }
    }, 1000);

    async function checkProvider(p: { id: string; name: string; provider: Eip1193Provider }) {
      if (!mounted || success || currentlyChecking || deadlinePassed || p.id !== lastProviderId) return;
      currentlyChecking = true;
      try {
        const accounts = await p.provider.request({ method: 'eth_accounts' }) as string[];
        const chainId = await p.provider.request({ method: 'eth_chainId' }).catch(() => undefined) as string | undefined;
        if (mounted && !deadlinePassed && !success) {
          success = true;
          if (accounts && accounts.length > 0) {
            setWalletState({ provider: p.provider, account: accounts[0], chainId, providerName: p.name, providerId: p.id, isRestoring: false });
          } else {
            setWalletState({ provider: p.provider, providerName: p.name, providerId: p.id, isRestoring: false });
          }
        }
      } catch {
        if (mounted && !deadlinePassed) {
          currentlyChecking = false;
        }
      }
    }

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.provider && detail.info) {
        const id = detail.info.rdns || detail.info.name;
        void checkProvider({ id, name: detail.info.name, provider: detail.provider });
      }
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);

    discoverWallets(250).then(async (providers) => {
      if (!mounted || success || deadlinePassed) return;
      const p = providers.find((x) => x.id === lastProviderId);
      if (p) {
        await checkProvider(p);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(restoreTimeout);
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
    };
  }, []);

  useEffect(() => {
    const provider = wallet.provider;
    if (!provider) return;

    const onAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (!accs || accs.length === 0) {
        setWalletState((prev) => ({ ...prev, account: undefined }));
      } else {
        setWalletState((prev) => ({ ...prev, account: accs[0] }));
      }
    };
    const onChainChanged = (chainId: unknown) => {
      setWalletState((prev) => ({ ...prev, chainId: String(chainId) }));
    };
    const onDisconnect = () => {
      setWalletState((prev) => ({ ...prev, account: undefined }));
    };

    provider.on?.('accountsChanged', onAccountsChanged);
    provider.on?.('chainChanged', onChainChanged);
    provider.on?.('disconnect', onDisconnect);

    return () => {
      provider.removeListener?.('accountsChanged', onAccountsChanged);
      provider.removeListener?.('chainChanged', onChainChanged);
      provider.removeListener?.('disconnect', onDisconnect);
    };
  }, [wallet.provider]);

  async function refresh() {
    try {
      setIsLoading(true);
      setError(null);
      setState(await adapter.load());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh ScopeGate state.');
    } finally {
      setIsLoading(false);
    }
  }

  const run = useCallback(async <T,>(operation: (adapter: DataAdapter) => Promise<T>) => {
    try {
      setError(null);
      const result = await operation(adapter);
      if (result && typeof result === 'object' && 'state' in result) {
        setState((result as { state: ScopeGateState }).state);
      } else if (result && typeof result === 'object' && 'schemaVersion' in result) {
        setState(result as unknown as ScopeGateState);
      } else {
        setState(await adapter.load());
      }
      return result;
    } catch (caught: any) {
      if (caught?.message !== 'Transaction cancelled.' && caught?.message !== 'Handled Tx Error') {
        setError(caught instanceof Error ? caught.message : 'Unknown ScopeGate error.');
      }
      return null;
    }
  }, [adapter]);

  async function setIdentity(identity: DemoIdentity) {
    setState(await adapter.setIdentity(identity));
  }

  async function setMode(mode: AppMode) {
    localStorage.setItem('scopegate-mode', mode);
    setModeState(mode);
  }

  async function setWallet(w: WalletState) {
    if (w.provider && w.providerId && w.account) {
      localStorage.setItem('scopegate-wallet-id', w.providerId);
    } else {
      localStorage.removeItem('scopegate-wallet-id');
    }
    setWalletState(w);
  }

  useEffect(() => {
    setIsLoading(true);
    adapter.load().then(setState).catch(caught => setError(caught.message)).finally(() => setIsLoading(false));
  }, [adapter]);

  const loadScope = useCallback(async (scope: 'workspaces' | 'workspaceDetails' | 'actions' | 'board', id?: string) => {
    try {
      setIsLoading(true);
      const newState = await adapter.loadScope(scope, id);
      setState((prev) => prev === newState ? prev : newState);
    } catch (caught) {
      if (caught instanceof Error && caught.message !== 'Transaction cancelled.' && caught.message !== 'Handled Tx Error') {
        setError(caught.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [adapter]);

  return (
    <StoreContext.Provider value={{ state, adapter, error, isLoading, mode, wallet, txState, liveDeploymentAddress, setError, setTxState, refresh, run, setIdentity, setMode, setWallet, loadScope }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useScopeGate() {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useScopeGate must be used within StoreProvider.');
  return value;
}

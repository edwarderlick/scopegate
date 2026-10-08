import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Menu,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  Square,
  Wallet,
  X,
} from 'lucide-react';
import { useScopeGate } from './store';
import type { ActionRequest, Agent, DemoIdentity, EvaluationStatus, PolicyVersion, ScopeGateState, Workspace } from './domain';
import { discoverWallets, GENLAYER_CHAIN, type WalletProviderInfo } from './wallet';

const EXAMPLES: Array<{ label: string; message: string; kind: EvaluationStatus }> = [
  { label: 'ALLOW', kind: 'ALLOW', message: 'You can export your beta data as a CSV file.' },
  { label: 'DENY', kind: 'DENY', message: 'Our mobile app launches next Friday.' },
  { label: 'NEEDS REVIEW', kind: 'NEEDS_REVIEW', message: 'We may offer refunds to everyone affected.' },
  { label: 'FAILURE', kind: 'EVALUATION_FAILED', message: 'Evaluation service unavailable for this example.' },
];

function selectedWorkspace(state: ScopeGateState) {
  return state.workspaces.find((workspace) => workspace.id === state.selectedWorkspaceId) ?? state.workspaces[0];
}

function activePolicy(state: ScopeGateState, workspace: Workspace) {
  return state.policies.find((policy) => policy.id === workspace.activePolicyId);
}

function short(value: string) {
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
}

function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function currentWallet(state: ScopeGateState) {
  return state.mode === 'live' ? state.walletAccount : '0x1111111111111111111111111111111111111111';
}

function canManageWorkspace(state: ScopeGateState, workspace: Workspace) {
  return sameAddress(workspace.ownerAddress, currentWallet(state));
}

function hasAuthorizedAgent(state: ScopeGateState, workspace: Workspace) {
  const wallet = state.mode === 'live' ? state.walletAccount : '0x3333333333333333333333333333333333333333';
  return state.agents.some((agent) => agent.workspaceId === workspace.id && agent.status === 'ACTIVE' && sameAddress(agent.wallet, wallet));
}

function StatusPill({ status }: { status: string }) {
  return <span className={`pill verdict-${status}`}>{status.replace('_', ' ')}</span>;
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel p-5 md:p-6 ${className}`}>{children}</section>;
}

function Paper({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`paper-panel p-5 md:p-6 ${className}`}>{children}</section>;
}

function Modal({ title, open, onClose, children }: { title: string; open: boolean; onClose(): void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="fixed inset-0 z-50 flex items-center justify-center bg-plum-void/90 p-4 backdrop-blur">
      <div className="panel max-h-[90vh] w-full max-w-3xl overflow-auto bg-plum-card">
        <div className="flex items-center justify-between border-b border-white/10 bg-plum-high p-4">
          <h2 id="modal-title" className="h3 text-parchment-paper">{title}</h2>
          <button ref={closeRef} className="btn-secondary min-h-10 px-3" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </div>
    </div>
  );
}

function CreateWorkspaceModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const { run, mode, txState } = useScopeGate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('Support Launch Notes');
  const [purpose, setPurpose] = useState('Approve public support copy before it reaches a community board.');
  const [mandate, setMandate] = useState('Publish only support statements backed by the approved factbook.');
  const [rules, setRules] = useState('Use only product facts supported by the factbook.\nDo not invent launch dates or future commitments.\nDo not promise refunds or compensation.');
  const [factbook, setFactbook] = useState('The beta supports CSV export.\nA mobile application is under consideration.\nNo mobile release date has been announced.\nRefund requests must be referred to the support team.');
  const steps = ['Name', 'Policy', 'Factbook', 'Review'];
  async function submit() {
    const result = await run((adapter) =>
      adapter.createWorkspace({ name, purpose, mandate, rules: rules.split('\n').filter(Boolean), factbook }),
    );
    if (result) {
      setStep(0);
      onClose();
    }
  }
  return (
    <Modal title="Create Workspace" open={open} onClose={onClose}>
      <div className="mb-5 flex flex-wrap gap-2 mono text-xs text-outline">
        {steps.map((item, index) => (
          <span key={item} className={`px-2 py-1 ${index === step ? 'bg-primary text-ink' : 'bg-plum-low'}`}>
            {index + 1}. {item}
          </span>
        ))}
      </div>
      {step === 0 && (
        <div className="space-y-4">
          <label className="block mono text-xs uppercase">Workspace name<input className="field mt-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="block mono text-xs uppercase">Purpose<textarea className="field mt-2" rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-4">
          <label className="block mono text-xs uppercase">Mandate<textarea className="field mt-2" rows={3} value={mandate} onChange={(event) => setMandate(event.target.value)} /></label>
          <label className="block mono text-xs uppercase">Numbered rules<textarea className="field mt-2" rows={5} value={rules} onChange={(event) => setRules(event.target.value)} /></label>
        </div>
      )}
      {step === 2 && <label className="block mono text-xs uppercase">Factbook<textarea className="field mt-2" rows={7} value={factbook} onChange={(event) => setFactbook(event.target.value)} /></label>}
      {step === 3 && (
        <Paper>
          <p className="mono text-xs text-[#7c5262]">{mode === 'live' ? 'Review workspace configuration before submitting to the contract.' : 'Review local workspace creation. No contract deployment or transaction signing occurs.'}</p>
          <h3 className="h3 mt-3">{name}</h3>
          <p className="mt-2 text-sm">{purpose}</p>
          <pre className="mt-4 whitespace-pre-wrap bg-parchment-warm p-3 text-sm">{mandate + '\n\n' + rules + '\n\n' + factbook}</pre>
        </Paper>
      )}
      <div className="mt-6 flex justify-between gap-3">
        <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
        <div className="flex gap-3">
          {step > 0 && <button className="btn-secondary" type="button" onClick={() => setStep(step - 1)}>Back</button>}
          {step < 3 ? <button className="btn-primary" type="button" onClick={() => setStep(step + 1)}>Next <ArrowRight size={16} /></button> : <button className="btn-primary" type="button" disabled={txState.status !== 'idle'} onClick={submit}>{mode === 'live' ? 'Create on-chain' : 'Create locally'}</button>}
        </div>
      </div>
    </Modal>
  );
}

function WalletDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { wallet, setWallet, refresh } = useScopeGate();
  const [providers, setProviders] = useState<WalletProviderInfo[]>([]);
  const [message, setMessage] = useState('Wallet state is separate from demo identities.');
  
  useEffect(() => {
    if (open) void discoverWallets().then(setProviders);
  }, [open]);

  async function connect(providerInfo: WalletProviderInfo) {
    try {
      setMessage('Connecting...');
      const accounts = (await providerInfo.provider.request({ method: 'eth_requestAccounts' })) as string[];
      if (accounts && accounts.length > 0) {
        const chainId = (await providerInfo.provider.request({ method: 'eth_chainId' })) as string;
        await setWallet({ provider: providerInfo.provider, account: accounts[0], chainId, providerName: providerInfo.name, providerId: providerInfo.id });
        await refresh();
        setMessage('');
      }
    } catch (error: any) {
      if (error?.code === 4001) {
        setMessage('Connection rejected by user.');
      } else {
        setMessage('Failed to connect.');
      }
    }
  }

  function disconnect() {
    setWallet({});
    setMessage('Disconnected.');
  }

  async function switchChain(providerInfo: WalletProviderInfo) {
    try {
      setMessage('Network switch requested.');
      await providerInfo.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: GENLAYER_CHAIN.chainId }] });
      setMessage('');
    } catch (error: any) {
      if (error?.code === 4001) {
        setMessage('Network switch rejected by user.');
        return;
      }
      try {
        setMessage('Network add requested.');
        await providerInfo.provider.request({ method: 'wallet_addEthereumChain', params: [GENLAYER_CHAIN] });
        
        const currentChain = (await providerInfo.provider.request({ method: 'eth_chainId' })) as string;
        if (currentChain !== GENLAYER_CHAIN.chainId) {
          await providerInfo.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: GENLAYER_CHAIN.chainId }] });
        }
        setMessage('');
      } catch (addError: any) {
        if (addError?.code === 4001) {
          setMessage('Network add rejected by user.');
        } else {
          setMessage('Failed to switch or add network.');
        }
      }
    }
  }
  return (
    <Modal title="Wallet" open={open} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-plum-low p-4 mono text-sm">
          <p>Network: {GENLAYER_CHAIN.chainName}</p>
          <p>Chain ID: 61997 / Hex {GENLAYER_CHAIN.chainId}</p>
          <p>Currency: GEN</p>
          <p className="wrap-anywhere">RPC: {GENLAYER_CHAIN.rpcUrls[0]}</p>
        </div>
        {providers.length === 0 ? <p>No injected wallet provider detected.</p> : providers.map((p) => {
          const isConnected = wallet.providerId === p.id && !!wallet.account;
          const isWrongNetwork = isConnected && wallet.chainId?.toLowerCase() !== GENLAYER_CHAIN.chainId.toLowerCase();

          return (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 bg-plum-low p-3">
              <div className="flex items-center gap-3">
                {p.icon && <img src={p.icon} alt={p.name} className="h-6 w-6 rounded" />}
                <span>{p.name}</span>
              </div>
              <div className="flex gap-2">
                {isConnected ? (
                  <>
                    {isWrongNetwork ? (
                      <button className="btn-primary" onClick={() => void switchChain(p)}>Switch Network</button>
                    ) : (
                      <span className="pill flex items-center gap-1 bg-plum-high text-primary"><Check size={14} /> Ready</span>
                    )}
                    <button className="btn-secondary" onClick={disconnect}>Disconnect</button>
                  </>
                ) : (
                  <button className="btn-primary" onClick={() => void connect(p)}>Connect</button>
                )}
              </div>
            </div>
          );
        })}
        <p className="mono text-xs text-outline">{message}</p>
        {wallet.account && <p className="wrap-anywhere text-sm">Connected account: {wallet.account} on {wallet.chainId}. This does not prove ScopeGate authorization.</p>}
      </div>
    </Modal>
  );
}

function TxOverlay() {
  const { txState, setTxState, run } = useScopeGate();
  if (txState.status === 'idle') return null;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-plum-void/90 p-4 backdrop-blur">
      <div className="panel max-h-[90vh] w-full max-w-lg overflow-auto bg-plum-card p-6" aria-live="polite">
        <h2 className="h3 mb-4">{txState.actionName || 'Transaction'}</h2>
        
        {txState.status === 'estimating' && (
          <div className="flex items-center gap-3">
            <RefreshCcw className="animate-spin text-primary" size={20} />
            <p>Estimating transaction fees...</p>
          </div>
        )}
        
        {txState.status === 'confirm' && (
          <div className="space-y-4">
            <p><strong>Network:</strong> GenLayer Studio-dev</p>
            <p><strong>Action:</strong> {txState.actionName}</p>
            <p><strong>Estimated deposit:</strong> {txState.feeValue?.toString() ?? '0'} wei</p>
            <p className="text-sm text-[#d3c2c6]">This is an estimated fee deposit, not necessarily the final cost.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-secondary" onClick={() => txState.resolve?.(false)}>Cancel</button>
              <button className="btn-primary" onClick={() => txState.resolve?.(true)}>Proceed to Wallet</button>
            </div>
          </div>
        )}

        {txState.status === 'wallet' && (
          <div className="flex items-center gap-3">
            <RefreshCcw className="animate-spin text-primary" size={20} />
            <p>Please confirm the transaction in your wallet...</p>
          </div>
        )}

        {txState.status === 'finalizing' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <RefreshCcw className="animate-spin text-primary" size={20} />
              <p>Transaction submitted. Waiting for finalization...</p>
            </div>
            {txState.hash && (
              <>
                <p className="mono wrap-anywhere text-xs text-outline">Hash: {txState.hash}</p>
                <a className="text-primary inline-flex items-center gap-2" href={`https://explorer-studio-dev.genlayer.com/transactions/${txState.hash}`} target="_blank" rel="noreferrer">
                  View on Explorer <ExternalLink size={15} />
                </a>
              </>
            )}
          </div>
        )}

        {txState.status === 'pending' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <RefreshCcw className="animate-spin text-primary" size={20} />
              <p>Submitted—still processing...</p>
            </div>
            {txState.hash && (
              <>
                <p className="mono wrap-anywhere text-xs text-outline">Hash: {txState.hash}</p>
                <a className="text-primary inline-flex items-center gap-2" href={`https://explorer-studio-dev.genlayer.com/transactions/${txState.hash}`} target="_blank" rel="noreferrer">
                  View on Explorer <ExternalLink size={15} />
                </a>
              </>
            )}
            <div className="mt-6 flex justify-end gap-3">
              {txState.hash && <button className="btn-secondary" onClick={() => void run(adapter => adapter.checkTransactionStatus(txState.hash!))}>Check status</button>}
              <button className="btn-primary" onClick={() => setTxState({ status: 'idle' })}>Close</button>
            </div>
          </div>
        )}

        {txState.status === 'success' && (
          <div className="space-y-4">
            <p className="text-primary font-bold">Transaction succeeded!</p>
            {txState.hash && (
              <a className="text-primary inline-flex items-center gap-2" href={`https://explorer-studio-dev.genlayer.com/transactions/${txState.hash}`} target="_blank" rel="noreferrer">
                View on Explorer <ExternalLink size={15} />
              </a>
            )}
            <div className="mt-6 flex justify-end">
              <button className="btn-primary" onClick={() => setTxState({ status: 'idle' })}>Close</button>
            </div>
          </div>
        )}

        {txState.status === 'error' && (
          <div className="space-y-4">
            <p className="text-[#f5a3a8] font-bold">Transaction failed.</p>
            <p className="mono wrap-anywhere text-xs text-outline">{txState.errorMessage}</p>
            {txState.hash && (
              <>
                <p className="mono wrap-anywhere text-xs text-outline">Hash: {txState.hash}</p>
                <a className="text-primary inline-flex items-center gap-2" href={`https://explorer-studio-dev.genlayer.com/transactions/${txState.hash}`} target="_blank" rel="noreferrer">
                  View on Explorer <ExternalLink size={15} />
                </a>
              </>
            )}
            <div className="mt-6 flex justify-end gap-3">
              {txState.hash && <button className="btn-secondary" onClick={() => void run(adapter => adapter.checkTransactionStatus(txState.hash!))}>Check status</button>}
              <button className="btn-primary" onClick={() => setTxState({ status: 'idle' })}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Shell() {
  const { state, error, mode, wallet, liveDeploymentAddress, setError, setIdentity, setMode, run } = useScopeGate();
  const [mobile, setMobile] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  if (error && !state) {
    return (
      <div className="min-h-screen bg-plum-base p-8 text-[#fcdae5]">
        <h2 className="text-[#f5a3a8] font-bold">Failed to load</h2>
        <p className="mt-2">{error}</p>
        <button className="btn-secondary mt-4" onClick={() => setMode('demo')}>Switch to Demo Mode</button>
      </div>
    );
  }
  if (!state) return <div className="min-h-screen bg-plum-base p-8 text-[#fcdae5]">Loading {mode === 'live' ? 'live data' : 'demo'}...</div>;
  const workspace = selectedWorkspace(state);
  const nav = [
    ['/', 'Home'],
    ['/how', 'How'],
    ['/workspaces', 'Workspaces'],
    ['/actions', 'Actions'],
    ['/submit', 'Submit'],
    ['/board', 'Board'],
  ];
  return (
    <div className="min-h-screen bg-plum-base text-[#fcdae5]">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-plum-base/95 backdrop-blur">
        <div className="page-pad flex flex-wrap items-center justify-between gap-3 bg-plum-void py-2 mono text-xs text-[#d3c2c6]">
          <span>{mode === 'live' ? 'Live mode - contract state is authoritative. No local fallback on RPC failure.' : 'Frontend demo - local data. No live GenLayer evaluations or publications.'}</span>
          <span className="wrap-anywhere">Studio-dev RPC: https://studio-dev.genlayer.com/api</span>
        </div>
        <div className="page-pad flex min-h-20 items-center justify-between gap-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <img src="/favicon.svg" alt="ScopeGate Logo" className="h-10 w-10 rounded-xl" />
            <span><strong className="h3 block leading-none">ScopeGate</strong><small className="text-[#d3c2c6]">Your agent. Your rules. Enforced.</small></span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => `px-3 py-2 text-sm ${isActive ? 'bg-plum-card text-primary' : 'text-[#d3c2c6] hover:text-white'}`}>{label}</NavLink>)}
          </nav>
          <div className="flex items-center gap-2">
            <select aria-label="Application mode" className="field max-w-32 py-2 text-sm" value={mode} onChange={(event) => void setMode(event.target.value as 'demo' | 'live')}>
              <option value="demo">Demo</option>
              <option value="live">Live</option>
            </select>
            {mode === 'demo' && (
              <select aria-label="Demo identity" className="field max-w-40 py-2 text-sm" value={state.identity} onChange={(event) => void setIdentity(event.target.value as DemoIdentity)}>
                <option value="owner">Owner demo identity</option>
                <option value="agent">Authorized-agent demo identity</option>
                <option value="viewer">Viewer demo identity</option>
              </select>
            )}
            <button className="btn-secondary hidden sm:inline-flex" onClick={() => setWalletOpen(true)}><Wallet size={16} /> {wallet.isRestoring ? 'Restoring wallet...' : wallet.account ? `${wallet.providerName || 'Wallet'} ${short(wallet.account)}` : 'Connect'}</button>
            <button className="btn-secondary lg:hidden" aria-expanded={mobile} onClick={() => setMobile(!mobile)}><Menu size={18} /></button>
          </div>
        </div>
        {mobile && <nav className="page-pad grid gap-2 pb-4 lg:hidden">{nav.map(([to, label]) => <NavLink key={to} to={to} onClick={() => setMobile(false)} className="bg-plum-card p-3">{label}</NavLink>)}</nav>}
        <div className="page-pad flex flex-wrap items-center justify-between gap-3 bg-plum-low py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mono text-xs text-outline">Workspace</span>
            <select className="field max-w-72 py-2" value={state.selectedWorkspaceId} onChange={(event) => void run((adapter) => adapter.selectWorkspace(event.target.value))}>
              {state.workspaces.length === 0 && <option value="">{error ? 'Error loading workspaces' : state.selectedWorkspaceId === '' && state.workspaces.length === 0 ? 'Loading workspaces...' : 'No workspaces'}</option>}
              {state.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <span className="pill bg-plum-high text-primary">{mode === 'live' ? (liveDeploymentAddress ? `Live ${wallet.account ? short(wallet.account) : 'read-only'}` : 'Not deployed') : 'Demo identity'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Create</button>
            {mode === 'demo' && <button className="btn-secondary" onClick={() => void run((adapter) => adapter.reset())}><RefreshCcw size={16} /> Reset Demo</button>}
          </div>
        </div>
      </header>
      {error && (
        <div className="page-pad bg-deny py-3 text-[#f5a3a8] flex items-center justify-between">
          <span>{error}</span>
          <div className="flex items-center gap-3">
            <button className="text-sm underline hover:text-white" onClick={() => window.location.reload()}>Retry</button>
            <button onClick={() => setError(null)}><X size={16} /></button>
          </div>
        </div>
      )}
      <main><Routes>
        <Route path="/" element={<Landing state={state} />} />
        <Route path="/how" element={<How />} />
        <Route path="/workspaces" element={<Workspaces state={state} openCreate={() => setCreateOpen(true)} />} />
        <Route path="/workspaces/:id" element={<WorkspaceOverview state={state} />} />
        <Route path="/workspaces/:id/policy" element={<PolicyPage state={state} />} />
        <Route path="/workspaces/:id/agents" element={<AgentsPage state={state} />} />
        <Route path="/actions" element={<ActionsPage state={state} />} />
        <Route path="/submit" element={<SubmitPage state={state} />} />
        <Route path="/actions/:id" element={<ActionDetail state={state} />} />
        <Route path="/board" element={<BoardPage state={state} />} />
        <Route path="*" element={<NotFound />} />
      </Routes></main>
      <footer className="page-pad border-t border-white/10 bg-plum-void py-10 text-sm text-[#d3c2c6]">
        <div className="flex flex-col justify-between gap-6 md:flex-row">
          <p className="max-w-xl">ScopeGate {mode} mode. Evaluation checks compliance with the owner policy and approved factbook. Semantic evaluation can be wrong or inconclusive. No user funds are held.</p>
          <a className="inline-flex items-center gap-2 text-primary" href="https://explorer-studio-dev.genlayer.com/" target="_blank" rel="noreferrer">Studio-dev explorer <ExternalLink size={15} /></a>
        </div>
      </footer>
      <CreateWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <WalletDialog open={walletOpen} onClose={() => setWalletOpen(false)} />
      <TxOverlay />
    </div>
  );
}

function Landing({ state }: { state: ScopeGateState }) {
  const workspace = selectedWorkspace(state);
  const counts = {
    workspaces: state.workspaces.length,
    activeAgents: state.agents.filter((agent) => agent.status === 'ACTIVE').length,
    readyPermits: state.permits.filter((permit) => permit.status === 'READY').length,
  };
  return (
    <>
      <section className="page-pad shell-grid grid gap-8 py-16 lg:grid-cols-12 lg:py-24">
        <div className="lg:col-span-8">
          <p className="mono mb-5 text-xs uppercase tracking-wider text-primary">GenLayer Studio Next / frontend boundary</p>
          <h1 className="h1">Your agent.<br /><em className="text-primary">Your rules.</em><br />Enforced.</h1>
          <p className="mt-6 max-w-2xl text-lg text-[#d3c2c6]">ScopeGate evaluates an agent's proposed board message against the workspace owner's policy and factbook before a one-message permit can be used. {state.mode === 'live' ? 'This build connects to the live Studio-dev contract.' : 'This build is local frontend only.'}</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link className="btn-primary" to="/workspaces">Enter app <ArrowRight size={16} /></Link><Link className="btn-secondary" to="/how">See how it works</Link></div>
        </div>
        {state.mode === 'demo' && (
          <Card className="lg:col-span-4">
            <p className="mono text-xs text-outline">Current demo register</p>
            <div className="mt-5 grid gap-3">
              <Metric label="Workspaces" value={counts.workspaces} />
              <Metric label="Active agents" value={counts.activeAgents} />
              <Metric label="READY permits" value={counts.readyPermits} />
            </div>
            <p className="mt-5 text-sm text-[#d3c2c6]">Selected workspace: {workspace?.name ?? 'None yet'}</p>
          </Card>
        )}
      </section>
      <Examples />
    </>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="bg-plum-low p-4"><div className="font-serif text-4xl text-primary">{value}</div><div className="mono text-xs text-outline">{label}</div></div>;
}

function Examples() {
  return (
    <section className="page-pad paper-grid bg-parchment-paper py-14 text-ink">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><h2 className="h2">Authored evaluation fixtures</h2><p className="max-w-lg text-sm text-[#5c4a52]">These outcomes are simulated examples. Custom messages remain pending backend evaluation and receive no permit.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        {EXAMPLES.map((example) => <Paper key={example.kind}><div className="flex items-center justify-between gap-3"><span className="mono text-xs text-[#7c5262]">{example.label}</span><StatusPill status={example.kind} /></div><p className="mt-4 bg-parchment-warm p-4 mono text-sm">"{example.message}"</p></Paper>)}
      </div>
    </section>
  );
}

function How() {
  const { mode } = useScopeGate();
  const steps = ['Owner creates policy and factbook.', 'Authorized demo agent submits one exact message.', mode === 'live' ? 'Contract executes semantic evaluation using GenLayer.' : 'Backend would evaluate compliance later; fixtures are labeled simulated here.', 'ALLOW creates a READY permit for one destination and exact message.', mode === 'live' ? 'Publishing consumes the permit and copies the approved message to the board.' : 'Publishing consumes the permit and copies the approved message to the demo board.'];
  return <section className="page-pad shell-grid py-12"><h1 className="h2">How ScopeGate Works</h1><div className="mt-8 grid gap-4 md:grid-cols-5">{steps.map((step, index) => <Card key={step}><Square className="mb-5 text-primary" size={16} /><p className="mono text-xs text-outline">0{index + 1}</p><p className="mt-3">{step}</p></Card>)}</div></section>;
}

function Workspaces({ state, openCreate }: { state: ScopeGateState; openCreate(): void }) {
  const { loadScope } = useScopeGate();
  useEffect(() => { void loadScope('workspaces'); }, [loadScope]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const rows = state.workspaces.filter((workspace) => {
    const owned = canManageWorkspace(state, workspace);
    const authorized = hasAuthorizedAgent(state, workspace);
    return (filter === 'all' || (filter === 'owned' && owned) || (filter === 'authorized' && authorized)) && `${workspace.name} ${workspace.ownerAddress} ${workspace.board}`.toLowerCase().includes(query.toLowerCase());
  });
  return <section className="page-pad py-12"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mono text-xs text-primary">Directory register</p><h1 className="h2">Workspace Directory</h1></div><button className="btn-primary" onClick={openCreate}><Plus size={16} /> Create Workspace</button></div><div className="mt-6 flex flex-col gap-3 md:flex-row"><input className="field" placeholder="Search title, owner, or board" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="field md:max-w-60" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All</option><option value="owned">Owned</option><option value="authorized">Authorized agent</option></select></div><div className="mt-8 grid gap-5">{rows.map((workspace) => <WorkspaceCard key={workspace.id} state={state} workspace={workspace} />)}</div></section>;
}

function WorkspaceCard({ state, workspace }: { state: ScopeGateState; workspace: Workspace }) {
  const agents = state.agents.filter((agent) => agent.workspaceId === workspace.id);
  const policy = activePolicy(state, workspace);
  const published = state.boardPosts.filter((post) => post.workspaceId === workspace.id).length;
  return <Card><div className="grid gap-5 lg:grid-cols-[1fr_18rem]"><div><div className="mb-2 flex flex-wrap gap-2"><span className="pill bg-plum-high text-primary">POLICY V{policy?.version ?? '?'} ACTIVE</span><span className="pill bg-plum-low text-[#d3c2c6]">{state.mode === 'live' ? 'Contract record' : 'Example records'}</span></div><Link className="h3 hover:text-primary" to={`/workspaces/${workspace.id}`}>{workspace.name} <ArrowRight className="inline" size={18} /></Link><p className="mt-3 text-[#d3c2c6]">{workspace.purpose}</p><p className="mono mt-3 wrap-anywhere text-xs text-outline">Owner {workspace.ownerAddress}</p></div><div className="grid grid-cols-3 gap-2 text-center lg:grid-cols-1"><Metric label="Agents" value={agents.length} /><Metric label="Published" value={published} /><Metric label="Rules" value={policy?.rules.length ?? 0} /></div></div></Card>;
}

function WorkspaceOverview({ state }: { state: ScopeGateState }) {
  const { loadScope, isLoading } = useScopeGate();
  const { id } = useParams();
  useEffect(() => { void loadScope('workspaceDetails', id); }, [loadScope, id]);
  const workspace = state.workspaces.find((item) => item.id === id) ?? selectedWorkspace(state);
  if (!workspace) {
    if (isLoading) return <section className="page-pad py-12"><Card>Loading workspace...</Card></section>;
    return <NotFound />;
  }
  const policy = activePolicy(state, workspace);
  return <section className="page-pad py-12"><p className="mono text-xs text-primary">Workspace overview</p><h1 className="h2">{workspace.name}</h1><div className="mt-8 grid gap-5 lg:grid-cols-3"><Card><BookOpen className="mb-4 text-primary" /><h2 className="h3">Policy</h2><p className="mt-2 text-[#d3c2c6]">{policy?.mandate ?? 'Policy not loaded.'}</p><Link className="mt-4 inline-flex text-primary" to={`/workspaces/${workspace.id}/policy`}>Open policy</Link></Card><Card><ShieldCheck className="mb-4 text-primary" /><h2 className="h3">Agents</h2><p className="mt-2 text-[#d3c2c6]">{state.agents.filter((agent) => agent.workspaceId === workspace.id && agent.status === 'ACTIVE').length} active authorizations.</p><Link className="mt-4 inline-flex text-primary" to={`/workspaces/${workspace.id}/agents`}>Manage agents</Link></Card><Card><Send className="mb-4 text-primary" /><h2 className="h3">Actions</h2><p className="mt-2 text-[#d3c2c6]">{state.requests.filter((request) => request.workspaceId === workspace.id).length} requests.</p><Link className="mt-4 inline-flex text-primary" to={`/submit?workspace=${workspace.id}`}>Submit message</Link></Card></div></section>;
}

function PolicyPage({ state }: { state: ScopeGateState }) {
  const { run, mode, txState, loadScope, isLoading } = useScopeGate();
  const { id } = useParams();
  useEffect(() => { void loadScope('workspaces'); }, [loadScope]);
  const workspace = state.workspaces.find((item) => item.id === id) ?? selectedWorkspace(state);
  const policy = workspace ? activePolicy(state, workspace) : undefined;
  const drafts = workspace ? state.policies.filter((item) => item.workspaceId === workspace.id && item.status === 'DRAFT') : [];
  const [mandate, setMandate] = useState('');
  const [rules, setRules] = useState('');
  const [factbook, setFactbook] = useState('');
  useEffect(() => {
    if (!policy) return;
    setMandate(policy.mandate);
    setRules(policy.rules.join('\n'));
    setFactbook(policy.factbook);
  }, [policy]);
  if (!workspace || !policy) {
    if (isLoading) return <section className="page-pad py-12"><Card>Loading policy...</Card></section>;
    return <NotFound />;
  }
  const canEdit = canManageWorkspace(state, workspace);
  return <section className="page-pad py-12"><h1 className="h2">Policy & Factbook</h1><div className="mt-6 grid gap-5 lg:grid-cols-2"><Card><p className="mono text-xs text-primary">Active version is read-only</p><h2 className="h3 mt-2">Policy v{policy.version}</h2><p className="mt-4">{policy.mandate}</p><ul className="mt-4 space-y-2">{policy.rules.map((rule) => <li key={rule} className="bg-plum-low p-3">{rule}</li>)}</ul><pre className="mt-4 whitespace-pre-wrap bg-plum-low p-3 text-sm">{policy.factbook}</pre></Card><Card><p className="mono text-xs text-primary">Edit creates a draft</p>{mode === 'live' && !canEdit && <p role="status" className="mt-3 text-sm text-[#f5a3a8] wrap-anywhere">Only workspace owner <span className="mono">{workspace.ownerAddress}</span> can save or activate policy drafts. Connect that wallet in MetaMask.</p>}<label className="mt-4 block mono text-xs">Mandate<textarea className="field mt-2" rows={3} value={mandate} onChange={(event) => setMandate(event.target.value)} /></label><label className="mt-4 block mono text-xs">Rules<textarea className="field mt-2" rows={5} value={rules} onChange={(event) => setRules(event.target.value)} /></label><label className="mt-4 block mono text-xs">Factbook<textarea className="field mt-2" rows={5} value={factbook} onChange={(event) => setFactbook(event.target.value)} /></label><button className="btn-primary mt-4" disabled={!canEdit || txState.status !== 'idle'} onClick={() => void run((adapter) => adapter.savePolicyDraft(workspace.id, mandate, rules.split('\n').filter(Boolean), factbook))}>{mode === 'live' ? 'Save to contract' : 'Save draft'}</button></Card></div><div className="mt-6 grid gap-3">{drafts.map((draft) => <Card key={draft.id} className="flex flex-wrap items-center justify-between gap-3"><span>Draft v{draft.version}</span><button className="btn-primary" disabled={!canEdit || txState.status !== 'idle'} onClick={() => window.confirm('Activate this policy and invalidate unused permits from the previous version?') && void run((adapter) => adapter.activateDraft(workspace.id, draft.id))}>{mode === 'live' ? 'Activate on-chain' : 'Activate draft'}</button></Card>)}</div></section>;
}

function AgentsPage({ state }: { state: ScopeGateState }) {
  const { run, mode, txState, loadScope, isLoading } = useScopeGate();
  const { id } = useParams();
  useEffect(() => { void loadScope('workspaceDetails', id); }, [loadScope, id]);
  const workspace = state.workspaces.find((item) => item.id === id) ?? selectedWorkspace(state);
  const [label, setLabel] = useState('Support Bot');
  const [wallet, setWallet] = useState(state.mode === 'live' ? state.walletAccount ?? '' : '0x3333333333333333333333333333333333333333');
  const [messageLimit, setMessageLimit] = useState(280);
  const [publicationCap, setPublicationCap] = useState(1);
  if (!workspace) {
    if (isLoading) return <section className="page-pad py-12"><Card>Loading agents...</Card></section>;
    return <NotFound />;
  }
  const agents = state.agents.filter((agent) => agent.workspaceId === workspace.id);
  const canEdit = canManageWorkspace(state, workspace);
  return <section className="page-pad py-12"><h1 className="h2">Agent Permissions</h1><div className="mt-6 grid gap-5 lg:grid-cols-[1fr_22rem]"><div className="grid gap-4">{agents.map((agent) => <AgentRow key={agent.id} agent={agent} canEdit={canEdit && txState.status === 'idle'} mode={mode} onRevoke={() => window.confirm('Revoke this agent and invalidate its unused permits?') && void run((adapter) => adapter.revokeAgent(agent.id))} />)}</div><Card><h2 className="h3">Authorize agent</h2><input className="field mt-4" value={label} onChange={(event) => setLabel(event.target.value)} aria-label="Agent label" /><input className="field mt-3" value={wallet} onChange={(event) => setWallet(event.target.value)} aria-label="Agent wallet" /><input className="field mt-3" type="number" min={1} value={messageLimit} onChange={(event) => setMessageLimit(Number(event.target.value))} aria-label="Message limit" /><input className="field mt-3" type="number" min={1} value={publicationCap} onChange={(event) => setPublicationCap(Number(event.target.value))} aria-label="Publication cap" /><button className="btn-primary mt-4" disabled={!canEdit || txState.status !== 'idle'} onClick={() => void run((adapter) => adapter.authorizeAgent({ workspaceId: workspace.id, label, wallet, board: workspace.board, messageLimit, publicationCap }))}>{mode === 'live' ? 'Authorize on-chain' : 'Authorize'}</button></Card></div></section>;
}

function AgentRow({ agent, canEdit, mode, onRevoke }: { agent: Agent; canEdit: boolean; mode: 'demo' | 'live'; onRevoke(): void }) {
  return <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="h3">{agent.label}</h2><p className="mono mt-2 wrap-anywhere text-xs text-outline">{agent.wallet}</p><p className="mt-2 text-sm text-[#d3c2c6]">Board {agent.board}. Publications {agent.publicationsUsed}/{agent.publicationCap}. Limit {agent.messageLimit} chars.</p></div><div className="flex gap-2"><StatusPill status={agent.status} />{agent.status === 'ACTIVE' && <button className="btn-secondary" disabled={!canEdit} onClick={onRevoke}>{mode === 'live' ? 'Revoke on-chain' : 'Revoke'}</button>}</div></div></Card>;
}

function SubmitPage({ state }: { state: ScopeGateState }) {
  const { run, txState, loadScope } = useScopeGate();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const workspaceId = params.get('workspace') ?? state.selectedWorkspaceId;
  useEffect(() => { void loadScope('workspaceDetails', workspaceId); }, [loadScope, workspaceId]);
  const workspace = state.workspaces.find((item) => item.id === workspaceId) ?? selectedWorkspace(state);
  const agents = workspace ? state.agents.filter((agent) => agent.workspaceId === workspace.id && agent.status === 'ACTIVE' && (state.mode !== 'live' || sameAddress(agent.wallet, state.walletAccount))) : [];
  const [agentId, setAgentId] = useState(agents[0]?.id ?? '');
  const [message, setMessage] = useState(EXAMPLES[0].message);
  const [kind, setKind] = useState<EvaluationStatus | undefined>('ALLOW');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!agents.some((agent) => agent.id === agentId)) setAgentId(agents[0]?.id ?? '');
  }, [agents, agentId]);
  if (!workspace) return <section className="page-pad py-12"><h1 className="h2">Submit Action</h1><Card>No live workspaces found. Create a workspace first.</Card></section>;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirm) return;
    const result = await run((adapter) => adapter.submitAction({ workspaceId: workspace.id, agentId, message, exampleKind: state.mode === 'live' ? undefined : kind }));
    if (result && 'requestId' in result) navigate(`/actions/${result.requestId}`);
  }
  return <section className="page-pad py-12"><h1 className="h2">Submit Action</h1><form className="mt-6 grid gap-5 lg:grid-cols-[1fr_22rem]" onSubmit={(event) => void submit(event)}><Card><label className="block mono text-xs">Agent<select className="field mt-2" value={agentId} onChange={(event) => setAgentId(event.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.label}</option>)}</select></label><label className="mt-4 block mono text-xs">Exact message<textarea className="field mt-2" rows={6} value={message} onChange={(event) => { setMessage(event.target.value); setKind(undefined); }} /></label><label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={confirm} onChange={(event) => setConfirm(event.target.checked)} /> I confirm this exact message and destination for review.</label><button className="btn-primary mt-4" disabled={!confirm || !agentId || txState.status !== 'idle'}>{state.mode === 'live' ? 'Submit to contract' : 'Create local request'}</button></Card><Card><p className="mono text-xs text-primary">{state.mode === 'live' ? 'Sample messages (simulate failure)' : 'Examples'}</p>{EXAMPLES.map((example) => <button type="button" key={example.kind} className="mt-3 block w-full bg-plum-low p-3 text-left text-sm" onClick={() => { setMessage(example.message); setKind(example.kind); }}>{state.mode !== 'live' && <StatusPill status={example.kind} />} <span className="mt-2 block">"{example.message}"</span></button>)}</Card></form></section>;
}

function ActionsPage({ state }: { state: ScopeGateState }) {
  const { loadScope, error, isLoading } = useScopeGate();
  const [params, setParams] = useSearchParams();
  const workspaceId = params.get('workspace') ?? state.selectedWorkspaceId;
  useEffect(() => { void loadScope('actions', workspaceId); }, [loadScope, workspaceId]);
  const [filter, setFilter] = useState('all');
  const rows = state.requests.filter((request) => request.workspaceId === workspaceId).filter((request) => filter === 'all' || state.evaluations.find((evaluation) => evaluation.id === request.evaluationId)?.status === filter);
  return <section className="page-pad py-12"><h1 className="h2">Action Queue</h1><div className="mt-6 flex flex-col gap-3 md:flex-row"><select className="field" value={workspaceId} onChange={(event) => setParams({ workspace: event.target.value })}>{state.workspaces.length === 0 && <option value="">{error ? 'Error loading workspaces' : 'Loading workspaces...'}</option>}{state.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><select className="field md:max-w-64" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All statuses</option><option value="ALLOW">ALLOW</option><option value="DENY">DENY</option><option value="NEEDS_REVIEW">NEEDS REVIEW</option><option value="PENDING">PENDING</option></select></div><div className="mt-6 grid gap-4">{rows.length > 0 ? rows.map((request) => <RequestRow key={request.id} state={state} request={request} />) : <Card>{error ? `Error: ${error}` : isLoading ? 'Loading...' : 'No requests yet.'}</Card>}</div></section>;
}

function RequestRow({ state, request }: { state: ScopeGateState; request: ActionRequest }) {
  const evaluation = state.evaluations.find((item) => item.id === request.evaluationId);
  const permit = state.permits.find((item) => item.id === request.permitId);
  return <Card><div className="flex flex-wrap justify-between gap-3"><div><Link className="h3 hover:text-primary" to={`/actions/${request.id}`}>{short(request.id)}</Link><p className="mt-2 wrap-anywhere text-[#d3c2c6]">"{request.message}"</p></div><div className="flex flex-col items-start gap-2 md:items-end"><StatusPill status={evaluation?.status ?? 'UNKNOWN'} />{permit && <span className="pill bg-plum-high text-primary">Permit {permit.status}</span>}</div></div></Card>;
}

function ActionDetail({ state }: { state: ScopeGateState }) {
  const { run, mode, txState, loadScope, error, isLoading, wallet } = useScopeGate();
  const { id } = useParams();
  useEffect(() => { void loadScope('actions', id); }, [loadScope, id]);
  const request = state.requests.find((item) => item.id === id);
  const evaluation = request ? state.evaluations.find((item) => item.id === request.evaluationId) : undefined;
  const isTerminal = evaluation && (evaluation.status === 'ALLOW' || evaluation.status === 'DENY' || evaluation.status === 'NEEDS_REVIEW');

  useEffect(() => {
    if (request && isTerminal) {
      localStorage.removeItem(`pending-tx-${request.id}`);
      localStorage.removeItem(`confirmed-eval-sync-${request.id}`);
    }
  }, [isTerminal, request?.id]);

  const lastFetchedPermit = useRef<string | null>(null);
  useEffect(() => {
    if (request?.permitId && mode === 'live' && lastFetchedPermit.current !== request.permitId) {
      lastFetchedPermit.current = request.permitId;
      void run((adapter) => adapter.refreshPermit(request.permitId!));
    }
  }, [request?.permitId, mode, run]);

  if (!request) {
    if (isLoading) return <section className="page-pad py-12"><Card>Loading action request...</Card></section>;
    return <NotFound />;
  }
  if (!evaluation) {
    if (error && !isLoading) {
      return (
        <section className="page-pad py-12">
          <Card>
            <p className="text-[#f5a3a8]">Error loading evaluation: {error}</p>
            <button className="btn-secondary mt-4" onClick={() => void loadScope('actions', id)}><RefreshCcw size={16} /> Retry</button>
          </Card>
        </section>
      );
    }
    return <section className="page-pad py-12"><Card>Evaluation loading...</Card></section>;
  }
  const permit = state.permits.find((item) => item.id === request.permitId);
  const agent = state.agents.find((item) => item.id === request.agentId);
  
  const unresolvedTxHash = isTerminal ? null : localStorage.getItem(`pending-tx-${request.id}`);
  const confirmedEvalNeedsSync = !!localStorage.getItem(`confirmed-eval-sync-${request.id}`);
  const lastEvalTx = localStorage.getItem(`last-eval-tx-${request.id}`);
  const lastEvalOutcome = localStorage.getItem(`last-eval-outcome-${request.id}`);
  const canEvaluate = (evaluation.status === 'PENDING' || evaluation.status === 'EVALUATION_FAILED') && !unresolvedTxHash;
  const isDisagreed = lastEvalOutcome === 'disagreed';
  
  const wrongWallet = mode === 'live' && (!agent || !wallet.account || agent.wallet.toLowerCase() !== wallet.account.toLowerCase());
  const walletInstruction = !agent
    ? 'Loading the bound agent wallet before publication.'
    : !wallet.account
      ? `Connect ${agent.wallet.slice(0, 6)}...${agent.wallet.slice(-4)} to publish.`
      : `Switch to ${agent.wallet.slice(0, 6)}...${agent.wallet.slice(-4)} to publish.`;
  
  return <section className="page-pad py-12"><Link to="/actions" className="text-primary">Back to queue</Link>{error && <div className="mt-4 border border-[#f5a3a8]/30 bg-plum-low p-4 rounded text-sm text-[#f5a3a8]"><p className="font-bold">RPC Error</p><p className="mt-1">{error}</p></div>}<div className="mt-6 grid gap-5 lg:grid-cols-[1fr_22rem]"><Card><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="h2">Evaluation Detail</h1><StatusPill status={evaluation.status} /></div><blockquote className="mt-6 bg-plum-low p-5 font-serif text-2xl">"{request.message}"</blockquote><p className="mt-5 text-[#d3c2c6]">{evaluation.summary}</p>{evaluation.structuredFindings && evaluation.structuredFindings.length > 0 ? <div className="mt-4 grid gap-3">{evaluation.structuredFindings.map((finding) => <div key={`${finding.id}-${finding.messageExcerpt}-${finding.sourceExcerpt}`} className="bg-plum-low p-3"><div className="flex flex-wrap items-center gap-2"><span className="mono text-xs text-primary">{finding.id}</span><StatusPill status={finding.status} /></div><p className="mt-2 text-sm">{finding.explanation}</p>{finding.messageExcerpt && <p className="mt-2 mono text-xs text-outline">Message: {finding.messageExcerpt}</p>}{finding.sourceExcerpt && <p className="mt-1 mono text-xs text-outline">Source: {finding.sourceExcerpt}</p>}</div>)}</div> : <ul className="mt-4 space-y-2">{evaluation.findings.map((finding) => <li key={finding} className="bg-plum-low p-3 wrap-anywhere"><pre className="whitespace-pre-wrap font-sans">{finding}</pre></li>)}</ul>}<Paper className="mt-5"><p className="mono text-xs text-[#7c5262]">Receipt inspection</p><p className="mt-2">Policy snapshot v{evaluation.policySnapshot?.version ?? '?'}</p><pre className="mt-3 whitespace-pre-wrap bg-parchment-warm p-3 text-sm">{evaluation.factbookSnapshot}</pre></Paper></Card><Card><h2 className="h3">Permit & publication</h2><p className="mt-3 text-sm text-[#d3c2c6]">Agent: {agent ? agent.label : 'Loading agent...'}. Destination: {request.destination}.</p>{lastEvalTx && <p className="mt-2 mono text-xs text-outline wrap-anywhere">Last eval hash: {lastEvalTx}</p>}{canEvaluate && (isDisagreed ? <button className="btn-secondary mt-4 w-full" disabled={txState.status !== 'idle'} onClick={() => void run((adapter) => adapter.evaluateAction(request.id))}><RefreshCcw size={16} /> Retry Evaluation (No Consensus)</button> : <button className="btn-primary mt-4 w-full" disabled={txState.status !== 'idle'} onClick={() => void run((adapter) => adapter.evaluateAction(request.id))}><ShieldCheck size={16} /> {mode === 'live' ? 'Evaluate via contract' : 'Evaluate locally'}</button>)}{unresolvedTxHash && <div className="mt-4 border border-primary/30 bg-plum-low p-4 rounded text-sm"><p className="text-primary font-bold">{confirmedEvalNeedsSync ? 'Evaluation confirmed' : 'Evaluation submitted'}</p><p className="mt-1 mb-3 text-outline">{confirmedEvalNeedsSync ? 'Transaction finalized; waiting to read the contract result.' : 'Transaction is still processing or undetermined.'}</p><button className="btn-secondary w-full" onClick={() => void run((adapter) => adapter.checkTransactionStatus(unresolvedTxHash))}>Check status</button></div>}{permit ? <div className="mt-4 space-y-3"><span className="pill bg-plum-high text-primary">Permit {permit.status}</span><p className="mono wrap-anywhere text-xs text-outline">Permit {permit.id} is bound to this exact message and board.</p>{permit.invalidReason && <p className="text-sm text-[#f5a3a8]">{permit.invalidReason}</p>}{wrongWallet && permit.status === 'READY' && <p className="text-sm text-[#f5a3a8]">{walletInstruction}</p>}{permit.status === 'USED' ? <Link to={`/board?workspace=${request.workspaceId}`} className="btn-secondary mt-4 w-full flex justify-center items-center gap-2"><Check size={16} /> Published (View Board)</Link> : permit.status !== 'READY' ? <p role="status" className="mt-4 border border-white/20 p-3 text-center text-outline">Publication unavailable for this permit.</p> : <button className="btn-primary w-full" disabled={txState.status !== 'idle' || wrongWallet} onClick={() => void run((adapter) => adapter.publish(request.id))}><Send size={16} /> {mode === 'live' ? 'Publish via contract' : 'Publish locally'}</button>}</div> : <p className="mt-4 text-[#d3c2c6]">No permit exists for denied, unclear, failed, or pending evaluations.</p>}<button className="btn-secondary mt-4 w-full" onClick={() => copyText(`ScopeGate receipt ${request.id}: ${evaluation.status}`)}><Copy size={16} /> Copy receipt</button></Card></div></section>;
}

function BoardPage({ state }: { state: ScopeGateState }) {
  const { loadScope } = useScopeGate();
  const [params, setParams] = useSearchParams();
  const workspaceId = params.get('workspace') ?? state.selectedWorkspaceId;
  useEffect(() => { void loadScope('board', workspaceId); }, [loadScope, workspaceId]);
  const posts = state.boardPosts.filter((post) => post.workspaceId === workspaceId);
  return <section className="page-pad bg-parchment-paper py-12 text-ink"><h1 className="h2">Community Board</h1><select className="field light mt-6 max-w-md" value={workspaceId} onChange={(event) => setParams({ workspace: event.target.value })}>{state.workspaces.length === 0 && <option value="">No workspaces</option>}{state.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select><div className="mt-6 grid gap-4">{posts.length === 0 ? <Paper>No published posts yet.</Paper> : posts.map((post) => <Paper key={post.id}><p className="wrap-anywhere font-serif text-2xl">"{post.message}"</p><p className="mono mt-4 text-xs text-[#7c5262]">Permit {post.permitId} {post.publishedAt ? `used at ${new Date(post.publishedAt).toLocaleString()}` : 'used; syncing on-chain timestamp'}</p></Paper>)}</div></section>;
}

function NotFound() {
  return <section className="page-pad py-20"><AlertTriangle className="mb-4 text-primary" /><h1 className="h2">Page Not Found</h1><p className="mt-3 text-[#d3c2c6]">This frontend only implements the mapped ScopeGate routes.</p><Link className="btn-primary mt-6" to="/workspaces">Go to workspaces</Link></section>;
}

export default function App() {
  return <Shell />;
}

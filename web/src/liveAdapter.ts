import { createClient, isSuccessful } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import pLimit from 'p-limit';
import type {
  Agent,
  AgentStatus,
  ActionRequest,
  AuthorizeAgentInput,
  BoardPost,
  CreateWorkspaceInput,
  DataAdapter,
  DemoIdentity,
  Evaluation,
  EvaluationStatus,
  Permit,
  PermitStatus,
  PolicyVersion,
  ScopeGateState,
  StructuredFinding,
  SubmitActionInput,
  Workspace,
} from './domain';
import type { Eip1193Provider } from './wallet';

type WalletSnapshot = { provider?: Eip1193Provider; account?: string; chainId?: string };

const PAGE = 50;
const SCHEMA_VERSION = 1;
const STUDIO_DEV_CHAIN_ID = '0xf22d';

function nonce(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function asNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(Math.ceil(s.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(s.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function asTimestamp(value: unknown) {
  const raw = asString(value);
  if (!raw) return '';
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric * 1000).toISOString();
  return raw;
}

function normalizeAddress(value: unknown) {
  return asString(value).toLowerCase();
}

function extractGenLayerError(error: any): string | undefined {
  try {
    const b64Result = error?.cause?.data?.receipt?.result;
    if (b64Result && typeof b64Result === 'string') {
      const decoded = atob(b64Result);
      return decoded.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
    }
  } catch (e) {
    // Ignore
  }
  return undefined;
}

function emptyState(address?: string, wallet?: WalletSnapshot): ScopeGateState {
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: 'live',
    deploymentAddress: address,
    walletAccount: wallet?.account,
    walletChainId: wallet?.chainId,
    identity: 'viewer',
    selectedWorkspaceId: '',
    workspaces: [],
    policies: [],
    agents: [],
    requests: [],
    evaluations: [],
    permits: [],
    boardPosts: [],
  };
}

const ACTION_LABELS: Record<string, string> = {
  create_workspace: 'Create Workspace',
  save_policy_draft: 'Save Policy Draft',
  activate_draft: 'Activate Policy Draft',
  authorize_agent: 'Authorize Agent',
  revoke_agent: 'Revoke Agent',
  submit_action: 'Submit Action',
  evaluate_request: 'Evaluate Action',
  publish: 'Publish to Board',
};

const limit = pLimit(3); // Global upstream concurrency limit

export class LiveAdapter implements DataAdapter {
  private _state: ScopeGateState;
  private _scopesLoaded = new Set<string>();
  private _scopeLoads = new Map<string, Promise<ScopeGateState>>();
  private _workspacesLoad?: Promise<void>;
  private _policiesLoad?: Promise<void>;

  constructor(
    private readonly getWallet: () => WalletSnapshot,
    private readonly getAddress: () => string | undefined,
    private readonly setTxState?: (updater: (prev: any) => any) => void
  ) {
    this._state = emptyState(getAddress(), getWallet());
  }

  private client(requireWallet = false) {
    const wallet = this.getWallet();
    const address = this.getAddress();
    if (!address) throw new Error('Not deployed. Configure VITE_SCOPEGATE_CONTRACT_ADDRESS to enable live writes.');
    if (!requireWallet) return createClient({ chain: studioDevnet });
    if (!wallet.provider || !wallet.account) throw new Error('Connect an injected wallet account for live writes.');
    if ((wallet.chainId ?? '').toLowerCase() !== STUDIO_DEV_CHAIN_ID) throw new Error('Switch wallet to GenLayer Studio-dev chain 61997 before writing.');
    return createClient({ chain: studioDevnet, account: wallet.account as `0x${string}`, provider: wallet.provider as never });
  }

  private async read<T>(functionName: string, args: unknown[] = []): Promise<T> {
    const address = this.getAddress();
    if (!address) return undefined as T;

    return limit(async () => {
      let retries = 3;
      let delay = 1000;
      let retryAfter = 0;
      for (let i = 0; i <= retries; i++) {
        if (retryAfter > 0) {
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          retryAfter = 0;
        } else if (i > 0) {
          await new Promise(r => setTimeout(r, delay * i));
        }

        try {
          const query = new URLSearchParams({
            address,
            functionName,
            args: JSON.stringify(args),
          });

          const res = await fetch(`/api/read?${query.toString()}`);
          if (res.status === 429) {
            const header = res.headers.get('Retry-After');
            if (header) retryAfter = parseInt(header, 10);
            if (i === retries) throw new Error(`Rate limit exceeded: 30 requests per minute. Studio-dev RPC is at capacity. (Retry in ${retryAfter || 5}s)`);
            continue;
          }
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || res.statusText);
          }
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          return data.result as T;
        } catch (caught) {
          if (i === retries) throw caught;
        }
      }
      throw new Error('Unreachable');
    });
  }

  private async write(functionName: string, args: unknown[], requestIdToTrack?: string) {
    const address = this.getAddress();
    if (!address) throw new Error('Not deployed. Configure VITE_SCOPEGATE_CONTRACT_ADDRESS.');
    const client = this.client(true);
    const tx = { address: address as `0x${string}`, functionName, args: args as never[] };

    if (this.setTxState) {
      this.setTxState(prev => ({ ...prev, status: 'estimating', actionName: ACTION_LABELS[functionName] || functionName, errorMessage: undefined, hash: undefined }));
    }

    try {
      const estimate = await client.estimateTransactionFeesForWrite(tx);

      if (this.setTxState) {
        const confirmed = await new Promise<boolean>((resolve) => {
          this.setTxState!(prev => ({ ...prev, status: 'confirm', feeValue: estimate.feeValue, resolve }));
        });
        if (!confirmed) {
          this.setTxState(prev => ({ ...prev, status: 'idle' }));
          throw new Error('Transaction cancelled.');
        }
        this.setTxState(prev => ({ ...prev, status: 'wallet' }));
      }

      const hash = await client.writeContract({
        ...tx,
        fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
      });

      if (requestIdToTrack) {
        localStorage.setItem(`pending-tx-${requestIdToTrack}`, hash);
        if (functionName === 'evaluate_request') {
          localStorage.setItem(`last-eval-tx-${requestIdToTrack}`, hash);
          localStorage.removeItem(`last-eval-outcome-${requestIdToTrack}`);
        }
      }

      if (this.setTxState) {
        this.setTxState(prev => ({ ...prev, status: 'finalizing', hash }));
      }

      let receipt;
      try {
        receipt = await client.waitForFinalization({ hash: hash as any });
      } catch (e) {
        // Leave it pending on timeout or not-found
      }

      if (!receipt) {
        if (this.setTxState) {
          this.setTxState(prev => ({ ...prev, status: 'pending', hash }));
        }
        throw new Error('__PENDING__');
      }
      
      const outcome = (receipt as any).result_name || (receipt as any).status_name || 'UNDETERMINED';
      const isAccepted = outcome === 'MAJORITY_AGREE' || outcome === 'accepted';
      const isDisagreed = outcome === 'MAJORITY_DISAGREE' || outcome === 'undetermined' || outcome === 'UNDETERMINED';

      if (!isSuccessful(receipt as any) || !isAccepted) {
        if (requestIdToTrack && functionName === 'evaluate_request') {
          localStorage.setItem(`last-eval-outcome-${requestIdToTrack}`, isDisagreed ? 'disagreed' : 'failed');
        }
        if (isDisagreed) {
           throw new Error('Execution finalized without consensus (majority disagreed or timed out)');
        }
        throw new Error(`Execution failed: ${outcome}`);
      }
      
      if (requestIdToTrack) {
        localStorage.removeItem(`pending-tx-${requestIdToTrack}`);
      }

      if (this.setTxState) {
        this.setTxState(prev => ({ ...prev, status: 'success' }));
      }
      return hash;
    } catch (error: any) {
      if (error.message === '__PENDING__') {
        throw new Error('Handled Tx Error'); // Halts caller, store.tsx ignores this without global error
      }
      if (requestIdToTrack && error.message !== 'Transaction cancelled.') {
        // Leave in local storage only if it's a timeout? No, if it's a definitive error we should remove it.
        // Wait, if it fails to finalize or fails executing, we can remove it.
        // What if it's just an RPC error?
        localStorage.removeItem(`pending-tx-${requestIdToTrack}`);
      }
      if (error?.message === 'Transaction cancelled.') {
        throw error;
      }
      const genLayerError = extractGenLayerError(error);
      const message = genLayerError || error?.shortMessage || error?.details || error?.message || 'Unknown error';
      if (this.setTxState) {
        let txHash: string | undefined;
        try { txHash = error.hash; } catch (e) {}
        this.setTxState(prev => ({ ...prev, status: 'error', errorMessage: message, hash: txHash || prev.hash }));
        throw new Error('Handled Tx Error');
      }
      throw error;
    }
  }

  async refreshPermit(permitId: string): Promise<ScopeGateState> {
      const rawPermit = await this.client(false).readContract({
        address: this.getAddress() as `0x${string}`,
        functionName: 'get_permit',
        args: [permitId],
      }) as Record<string, unknown>;
      if (rawPermit) {
        const newPermit = normalizePermit(rawPermit);
        const permitIndex = this._state.permits.findIndex(p => p.id === newPermit.id);
        if (permitIndex >= 0) this._state.permits[permitIndex] = newPermit;
        else this._state.permits = [newPermit, ...this._state.permits];
        this._state = { ...this._state };
      }
    return this._state;
  }

  async checkTransactionStatus(hash: string): Promise<ScopeGateState> {
    if (this.setTxState) {
      this.setTxState(prev => ({ ...prev, status: 'finalizing', hash, errorMessage: undefined }));
    }
    const client = this.client(false);
    try {
      let receipt;
      try {
        receipt = await client.waitForFinalization({ hash: hash as any });
      } catch (e: any) {
        throw new Error('Transaction is still pending or not found');
      }

      if (!receipt) {
        throw new Error('Transaction is still pending or not found');
      }

      const outcome = (receipt as any).result_name || (receipt as any).status_name || 'UNDETERMINED';
      const isAccepted = outcome === 'MAJORITY_AGREE' || outcome === 'accepted';
      const isDisagreed = outcome === 'MAJORITY_DISAGREE' || outcome === 'undetermined' || outcome === 'UNDETERMINED';

      if (!isSuccessful(receipt as any) || !isAccepted) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('last-eval-tx-') && localStorage.getItem(key) === hash) {
            const reqId = key.replace('last-eval-tx-', '');
            localStorage.setItem(`last-eval-outcome-${reqId}`, isDisagreed ? 'disagreed' : 'failed');
          }
        }
        if (isDisagreed) {
           throw new Error('Execution finalized without consensus (majority disagreed or timed out)');
        }
        throw new Error(`Execution failed: ${outcome}`);
      }
      // Reconcile only records affected by this transaction
      let affectedRequestId: string | undefined;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('pending-tx-') && localStorage.getItem(key) === hash) {
          affectedRequestId = key.replace('pending-tx-', '');
          break;
        }
      }

      let reconciled = !affectedRequestId;
      if (affectedRequestId) {
        try {
          const rawReq = await client.readContract({
            address: this.getAddress() as `0x${string}`,
            functionName: 'get_request',
            args: [affectedRequestId],
          }) as Record<string, unknown>;
          
          if (rawReq) {
            const newReq = normalizeRequest(rawReq);
            const reqIndex = this._state.requests.findIndex(r => r.id === newReq.id);
            if (reqIndex >= 0) this._state.requests[reqIndex] = newReq;
            else this._state.requests = [newReq, ...this._state.requests];

            if (newReq.evaluationId) {
              const rawEval = await client.readContract({
                address: this.getAddress() as `0x${string}`,
                functionName: 'get_evaluation',
                args: [newReq.evaluationId],
              }) as Record<string, unknown>;
              if (rawEval) {
                const newEval = normalizeEvaluation(rawEval);
                const evalIndex = this._state.evaluations.findIndex(e => e.id === newEval.id);
                if (evalIndex >= 0) this._state.evaluations[evalIndex] = newEval;
                else this._state.evaluations = [newEval, ...this._state.evaluations];
              }
            }

            if (newReq.permitId) {
              const rawPermit = await client.readContract({
                address: this.getAddress() as `0x${string}`,
                functionName: 'get_permit',
                args: [newReq.permitId],
              }) as Record<string, unknown>;
              if (rawPermit) {
                const newPermit = normalizePermit(rawPermit);
                const permitIndex = this._state.permits.findIndex(p => p.id === newPermit.id);
                if (permitIndex >= 0) this._state.permits[permitIndex] = newPermit;
                else this._state.permits = [newPermit, ...this._state.permits];
              }
            }

            try {
              const rawPost = await client.readContract({
                address: this.getAddress() as `0x${string}`,
                functionName: 'get_post',
                args: [`post_${affectedRequestId}`],
              }) as Record<string, unknown>;
              if (rawPost) {
                const newPost = normalizePost(rawPost);
                const postIndex = this._state.boardPosts.findIndex(p => p.id === newPost.id);
                if (postIndex >= 0) this._state.boardPosts[postIndex] = newPost;
                else this._state.boardPosts = [newPost, ...this._state.boardPosts];
              }
            } catch (e) {}
            
            this._state = { ...this._state };
            reconciled = true;
          }
        } catch (e) {
          // Keep the hash so the user can retry the targeted read without
          // submitting another transaction.
        }
      }

      if (!reconciled) {
        this.setTxState?.(prev => ({ ...prev, status: 'pending', hash }));
        return this._state;
      }

      // Clear all matching hashes from localStorage
      if (affectedRequestId) {
        localStorage.removeItem(`pending-tx-${affectedRequestId}`);
        localStorage.removeItem(`confirmed-eval-sync-${affectedRequestId}`);
      }
      this.setTxState?.(prev => ({ ...prev, status: 'success', hash }));
      return this._state;
    } catch (error: any) {
      // Clear matching hashes on error too since we've checked the receipt and it's definitely an error
      if (error.message !== 'Transaction is still pending or not found') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('pending-tx-') && localStorage.getItem(key) === hash) {
            localStorage.removeItem(key);
          }
        }
      }
      const genLayerError = extractGenLayerError(error);
      const message = genLayerError || error?.shortMessage || error?.details || error?.message || 'Unknown error';
      if (this.setTxState) {
        this.setTxState(prev => ({ ...prev, status: 'error', errorMessage: message, hash }));
        throw new Error('Handled Tx Error');
      }
      throw error;
    }
  }

  private async readPage<T>(listName: string, getName: string): Promise<T[]> {
    const address = this.getAddress();
    if (!address) return [];
    const ids: string[] = [];
    let offset = 0;
    for (;;) {
      const page = (await this.read<string[]>(listName, [offset, PAGE])) ?? [];
      ids.push(...page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    const rows = await Promise.all(ids.map(id => this.read<T>(getName, [id])));
    return rows;
  }

  private async refreshAffected<T>(listName: string, getName: string, targetArray: any[], normalizer: (r: any) => any) {
    const items = await this.readPage<any>(listName, getName);
    return items.map(normalizer);
  }

  async load(): Promise<ScopeGateState> {
    return this._state;
  }

  async loadScope(scope: 'workspaces' | 'workspaceDetails' | 'actions' | 'board', id?: string): Promise<ScopeGateState> {
    const key = `${scope}-${id || ''}`;
    const pending = this._scopeLoads.get(key);
    if (pending) return pending;
    const task = this._loadScope(scope, id);
    this._scopeLoads.set(key, task);
    try {
      return await task;
    } finally {
      this._scopeLoads.delete(key);
    }
  }

  private async _loadScope(scope: 'workspaces' | 'workspaceDetails' | 'actions' | 'board', id?: string): Promise<ScopeGateState> {
    const address = this.getAddress();
    const wallet = this.getWallet();
    if (!address) return this._state;

    if (
      this._state.deploymentAddress !== address ||
      this._state.walletAccount !== wallet.account ||
      this._state.walletChainId !== wallet.chainId ||
      this._state.mode !== 'live'
    ) {
      this._state = { ...this._state, deploymentAddress: address, walletAccount: wallet.account, walletChainId: wallet.chainId, mode: 'live' };
    }

    const cacheKey = `${scope}-${id || ''}`;
    if (this._scopesLoaded.has(cacheKey)) return this._state;

    let updated = false;

    if (scope === 'workspaces') {
      if (await this._loadWorkspacesScope(true)) updated = true;
    }
    
    if (scope === 'workspaceDetails') {
      if (await this._loadWorkspacesScope(true)) updated = true;
      if (!this._scopesLoaded.has('workspaceDetails')) {
        const rawAgents = await this.readPage<Record<string, unknown>>('list_agents', 'get_agent');
        this._state.agents = rawAgents.map(normalizeAgent);
        this._scopesLoaded.add('workspaceDetails');
        updated = true;
      }
    }

    if (scope === 'actions') {
      if (await this._loadWorkspacesScope(false)) updated = true;
      const requestId = id?.startsWith('request_') ? id : undefined;
      if (requestId && !this._state.requests.some(r => r.id === requestId)) {
        const rawRequest = await this.read<Record<string, unknown>>('get_request', [requestId]);
        if (rawRequest) {
          this._state.requests = [normalizeRequest(rawRequest), ...this._state.requests];
          updated = true;
        }
      }
      if (!requestId && !this._scopesLoaded.has('actions')) {
        const rawRequests = await this.readPage<Record<string, unknown>>('list_requests', 'get_request');
        this._state.requests = rawRequests.map(normalizeRequest);
        this._scopesLoaded.add('actions');
        updated = true;
      }
      const workspaceId = requestId ? undefined : (id || this._state.selectedWorkspaceId);
      const visibleRequests = this._state.requests.filter(r => requestId ? r.id === requestId : r.workspaceId === workspaceId);
      const missingEvaluations = visibleRequests.filter(r => r.evaluationId && !this._state.evaluations.some(e => e.id === r.evaluationId));
      if (missingEvaluations.length) {
        const rows = await Promise.all(missingEvaluations.map(r => this.read<Record<string, unknown>>('get_evaluation', [r.evaluationId])));
        this._state.evaluations = [...rows.filter(Boolean).map(normalizeEvaluation), ...this._state.evaluations];
        updated = true;
      }
      if (requestId) {
        const req = visibleRequests[0];
        if (req?.agentId && !this._state.agents.some(a => a.id === req.agentId)) {
          const rawAgent = await this.read<Record<string, unknown>>('get_agent', [req.agentId]);
          if (rawAgent) {
            this._state.agents = [normalizeAgent(rawAgent), ...this._state.agents];
            updated = true;
          }
        }
        if (req?.permitId && !this._state.permits.some(p => p.id === req.permitId)) {
          const rawPermit = await this.read<Record<string, unknown>>('get_permit', [req.permitId]);
          if (rawPermit) {
            this._state.permits = [normalizePermit(rawPermit), ...this._state.permits];
            updated = true;
          }
        }
      }
    }

    if (scope === 'board') {
      if (await this._loadWorkspacesScope(false)) updated = true;
      if (!this._scopesLoaded.has('board')) {
        const rawPosts = await this.readPage<Record<string, unknown>>('list_posts', 'get_post');
        const posts = new Map(this._state.boardPosts.map(post => [post.id, post]));
        for (const post of rawPosts.map(normalizePost)) posts.set(post.id, post);
        this._state.boardPosts = [...posts.values()];
        this._scopesLoaded.add('board');
        updated = true;
      }
    }

    this._scopesLoaded.add(cacheKey);

    // Return new object reference if updated
    if (updated) {
      this._state = { ...this._state };
    }
    
    return this._state;
  }

  private async _loadWorkspacesScope(includePolicies: boolean) {
    const needsWorkspaces = !this._scopesLoaded.has('workspaces');
    const needsPolicies = includePolicies && !this._scopesLoaded.has('policies');
    if (needsWorkspaces) {
      this._workspacesLoad ??= (async () => {
        const rows = await this.readPage<Record<string, unknown>>('list_workspaces', 'get_workspace');
        this._state.workspaces = rows.map(normalizeWorkspace);
        const saved = localStorage.getItem('scopegate-live-selected-workspace');
        if (this._state.workspaces.length > 0 && !this._state.workspaces.some(w => w.id === this._state.selectedWorkspaceId)) {
          this._state.selectedWorkspaceId = this._state.workspaces.find(w => w.id === saved)?.id || this._state.workspaces[0].id;
        }
        this._scopesLoaded.add('workspaces');
      })().finally(() => { this._workspacesLoad = undefined; });
      await this._workspacesLoad;
    }
    if (needsPolicies) {
      this._policiesLoad ??= (async () => {
        const rows = await this.readPage<Record<string, unknown>>('list_policies', 'get_policy');
        this._state.policies = rows.map(normalizePolicy);
        this._scopesLoaded.add('policies');
      })().finally(() => { this._policiesLoad = undefined; });
      await this._policiesLoad;
    }
    return needsWorkspaces || needsPolicies;
  }

  async reset(): Promise<ScopeGateState> {
    throw new Error('Reset Demo is unavailable in live mode.');
  }

  async setIdentity(_identity: DemoIdentity): Promise<ScopeGateState> {
    throw new Error('Demo identity switching is unavailable in live mode.');
  }

  async selectWorkspace(id: string) {
    localStorage.setItem('scopegate-live-selected-workspace', id);
    this._state = { ...this._state, selectedWorkspaceId: id };
    return this._state;
  }

  async createWorkspace(input: CreateWorkspaceInput) {
    if (!input.name.trim() || !input.mandate.trim() || input.rules.filter(Boolean).length === 0) throw new Error('Workspace name, mandate, and rules are required.');
    await this.write('create_workspace', [nonce('workspace'), input.name, input.purpose, input.mandate, input.rules, input.factbook]);
    this._state.workspaces = await this.refreshAffected('list_workspaces', 'get_workspace', this._state.workspaces, normalizeWorkspace);
    this._state.policies = await this.refreshAffected('list_policies', 'get_policy', this._state.policies, normalizePolicy);
    this._state = { ...this._state };
    return this._state;
  }

  async savePolicyDraft(workspaceId: string, mandate: string, rules: string[], factbook: string) {
    if (!mandate.trim() || rules.filter(Boolean).length === 0) throw new Error('Mandate and rules are required.');
    await this.write('save_policy_draft', [workspaceId, nonce('policy'), mandate, rules, factbook]);
    this._state.policies = await this.refreshAffected('list_policies', 'get_policy', this._state.policies, normalizePolicy);
    this._state = { ...this._state };
    return this._state;
  }

  async activateDraft(workspaceId: string, draftId: string) {
    await this.write('activate_draft', [workspaceId, draftId]);
    this._state.policies = await this.refreshAffected('list_policies', 'get_policy', this._state.policies, normalizePolicy);
    this._state.permits = await this.refreshAffected('list_permits', 'get_permit', this._state.permits, normalizePermit);
    this._state = { ...this._state };
    return this._state;
  }

  async authorizeAgent(input: AuthorizeAgentInput) {
    if (!input.label.trim() || !input.wallet.trim() || input.messageLimit < 1 || input.publicationCap < 1) throw new Error('All agent fields are required.');
    await this.write('authorize_agent', [
      input.workspaceId,
      nonce('agent'),
      input.label,
      hexToBytes(input.wallet),
      BigInt(input.messageLimit),
      BigInt(input.publicationCap),
    ]);
    this._state.agents = await this.refreshAffected('list_agents', 'get_agent', this._state.agents, normalizeAgent);
    this._state = { ...this._state };
    return this._state;
  }

  async revokeAgent(agentId: string) {
    await this.write('revoke_agent', [agentId]);
    this._state.agents = await this.refreshAffected('list_agents', 'get_agent', this._state.agents, normalizeAgent);
    this._state.permits = await this.refreshAffected('list_permits', 'get_permit', this._state.permits, normalizePermit);
    this._state = { ...this._state };
    return this._state;
  }

  async submitAction(input: SubmitActionInput) {
    if (!input.message.trim()) throw new Error('Message is required.');
    const clientNonce = nonce('req');
    await this.write('submit_action', [input.workspaceId, input.agentId, clientNonce, input.message]);
    
    // Resolve the actual contract request ID directly from the RPC to bypass edge cache delays
    const reqId = await this.client(false).readContract({
      address: this.getAddress() as `0x${string}`,
      functionName: 'get_request_id_for',
      args: [this.getWallet().account || '', clientNonce],
    }) as string;
    
    if (!reqId) throw new Error('Failed to resolve request ID from contract after finalization.');
    
    // Fetch the new request directly to update local state immediately
    const rawReq = await this.client(false).readContract({
      address: this.getAddress() as `0x${string}`,
      functionName: 'get_request',
      args: [reqId],
    }) as Record<string, unknown>;
    
    const newReq = normalizeRequest(rawReq);

    if (newReq.evaluationId) {
      try {
        const rawEval = await this.client(false).readContract({
          address: this.getAddress() as `0x${string}`,
          functionName: 'get_evaluation',
          args: [newReq.evaluationId],
        }) as Record<string, unknown>;
        const newEval = normalizeEvaluation(rawEval);
        const evalIndex = this._state.evaluations.findIndex(e => e.id === newEval.id);
        if (evalIndex >= 0) {
          this._state.evaluations[evalIndex] = newEval;
        } else {
          this._state.evaluations = [newEval, ...this._state.evaluations];
        }
      } catch (e) {
        // Ignore evaluation fetch failure during submitAction, UI will retry
      }
    }

    this._state.requests = [newReq, ...this._state.requests];
    this._state = { ...this._state };
    return { state: this._state, requestId: reqId };
  }

  async evaluateAction(requestId: string) {
    const hash = await this.write('evaluate_request', [requestId], requestId);
    try {
    
    // Read the updated request bypassing cache
    const rawReq = await this.client(false).readContract({
      address: this.getAddress() as `0x${string}`,
      functionName: 'get_request',
      args: [requestId],
    }) as Record<string, unknown>;
    
    if (!rawReq) throw new Error('Evaluation request is not readable yet.');
    const newReq = normalizeRequest(rawReq);
    
    const reqIndex = this._state.requests.findIndex(r => r.id === newReq.id);
    if (reqIndex >= 0) {
      this._state.requests[reqIndex] = newReq;
    } else {
      this._state.requests = [newReq, ...this._state.requests];
    }

    if (newReq.evaluationId) {
      const rawEval = await this.client(false).readContract({
        address: this.getAddress() as `0x${string}`,
        functionName: 'get_evaluation',
        args: [newReq.evaluationId],
      }) as Record<string, unknown>;
      if (rawEval) {
        const newEval = normalizeEvaluation(rawEval);
        const evalIndex = this._state.evaluations.findIndex(e => e.id === newEval.id);
        if (evalIndex >= 0) {
          this._state.evaluations[evalIndex] = newEval;
        } else {
          this._state.evaluations = [newEval, ...this._state.evaluations];
        }
      }
    }

    if (newReq.permitId) {
      const rawPermit = await this.client(false).readContract({
        address: this.getAddress() as `0x${string}`,
        functionName: 'get_permit',
        args: [newReq.permitId],
      }) as Record<string, unknown>;
      if (rawPermit) {
        const newPermit = normalizePermit(rawPermit);
        const permitIndex = this._state.permits.findIndex(p => p.id === newPermit.id);
        if (permitIndex >= 0) {
          this._state.permits[permitIndex] = newPermit;
        } else {
          this._state.permits = [newPermit, ...this._state.permits];
        }
      }
    }

    this._state = { ...this._state };
    localStorage.removeItem(`confirmed-eval-sync-${requestId}`);
    return this._state;
    } catch {
      localStorage.setItem(`pending-tx-${requestId}`, hash);
      localStorage.setItem(`confirmed-eval-sync-${requestId}`, '1');
      this.setTxState?.(prev => ({ ...prev, status: 'pending', hash }));
      return this._state;
    }
  }

  async publish(requestId: string) {
    const req = this._state.requests.find(r => r.id === requestId);
    if (!req?.permitId) throw new Error('A ready permit is required to publish.');
    const agent = this._state.agents.find(a => a.id === req.agentId);
    const account = this.getWallet().account;
    if (!account || !agent || account.toLowerCase() !== agent.wallet.toLowerCase()) {
      throw new Error(`Connect the bound agent wallet${agent ? ` (${agent.wallet})` : ''} to publish.`);
    }
    await this.refreshPermit(req.permitId);
    const freshPermit = this._state.permits.find(p => p.id === req.permitId);
    if (freshPermit?.status !== 'READY' || freshPermit.invalidReason) {
      throw new Error(freshPermit?.invalidReason || 'Permit is no longer ready to publish.');
    }
    await this.write('publish', [requestId], requestId);
    // Finalized consensus confirms the permit was consumed. Keep the UI safe if
    // the immediately following RPC reads are delayed or rate-limited.
    this._state.permits = this._state.permits.map(p => p.id === req.permitId ? { ...p, status: 'USED' as PermitStatus } : p);
    const postId = `post_${requestId}`;
    if (!this._state.boardPosts.some(p => p.id === postId)) {
      this._state.boardPosts = [{
        id: postId,
        workspaceId: req.workspaceId,
        agentId: req.agentId,
        message: req.message,
        permitId: req.permitId,
        publishedAt: '',
      }, ...this._state.boardPosts];
    }
    this._state = { ...this._state };
    
    // Read the updated permit and post directly
    try {
      const rawPermit = await this.client(false).readContract({
        address: this.getAddress() as `0x${string}`,
        functionName: 'get_permit',
        args: [req.permitId],
      }) as Record<string, unknown>;
      if (rawPermit) {
        const newPermit = normalizePermit(rawPermit);
        const permitIndex = this._state.permits.findIndex(p => p.id === newPermit.id);
        if (permitIndex >= 0) {
          this._state.permits[permitIndex] = newPermit;
        } else {
          this._state.permits = [newPermit, ...this._state.permits];
        }
      }
      const rawPost = await this.client(false).readContract({
        address: this.getAddress() as `0x${string}`,
        functionName: 'get_post',
        args: [postId],
      }) as Record<string, unknown>;
      if (rawPost) {
        const newPost = normalizePost(rawPost);
        const postIndex = this._state.boardPosts.findIndex(p => p.id === newPost.id);
        if (postIndex >= 0) this._state.boardPosts[postIndex] = newPost;
        else this._state.boardPosts = [newPost, ...this._state.boardPosts];
      }
    } catch {
      // Keep the confirmed USED permit and post while public reads recover.
    }
    
    this._state = { ...this._state };
    return this._state;
  }
}

function normalizeWorkspace(raw: Record<string, unknown>): Workspace {
  return {
    id: asString(raw.id),
    name: asString(raw.name),
    purpose: asString(raw.purpose),
    board: asString(raw.board),
    ownerAddress: normalizeAddress(raw.ownerAddress || raw.owner_address),
    activePolicyId: asString(raw.activePolicyId || raw.active_policy_id),
  };
}

function normalizePolicy(raw: Record<string, unknown>): PolicyVersion {
  return {
    id: asString(raw.id),
    workspaceId: asString(raw.workspaceId || raw.workspace_id),
    version: asNumber(raw.version),
    status: asString(raw.status) as 'ACTIVE' | 'DRAFT' | 'HISTORICAL',
    mandate: asString(raw.mandate),
    rules: Array.isArray(raw.rules) ? raw.rules.map(asString) : [],
    factbook: asString(raw.factbook),
    createdAt: asTimestamp(raw.createdAt || raw.created_at),
  };
}

function normalizeAgent(raw: Record<string, unknown>): Agent {
  return {
    id: asString(raw.id),
    workspaceId: asString(raw.workspaceId || raw.workspace_id),
    label: asString(raw.label),
    wallet: normalizeAddress(raw.wallet),
    board: asString(raw.board),
    messageLimit: asNumber(raw.messageLimit || raw.message_limit),
    publicationCap: asNumber(raw.publicationCap || raw.publication_cap),
    publicationsUsed: asNumber(raw.publicationsUsed || raw.publications_used),
    status: asString(raw.status) as AgentStatus,
  };
}

function normalizeRequest(raw: Record<string, unknown>): ActionRequest {
  return {
    id: asString(raw.id),
    workspaceId: asString(raw.workspaceId || raw.workspace_id),
    agentId: asString(raw.agentId || raw.agent_id),
    message: asString(raw.message),
    destination: asString(raw.destination),
    createdAt: asTimestamp(raw.createdAt || raw.created_at),
    evaluationId: asString(raw.evaluationId || raw.evaluation_id),
    permitId: asString(raw.permitId || raw.permit_id),
  };
}

function normalizeEvaluation(raw: Record<string, unknown>): Evaluation {
  return {
    id: asString(raw.id),
    requestId: asString(raw.requestId || raw.request_id),
    status: asString(raw.status) as EvaluationStatus,
    summary: asString(raw.summary),
    findings: Array.isArray(raw.findings) ? raw.findings.map(asString) : [],
    policySnapshot: (raw.policySnapshot || raw.policy_snapshot) ? normalizePolicy((raw.policySnapshot || raw.policy_snapshot) as Record<string, unknown>) : ({} as PolicyVersion),
    factbookSnapshot: asString(raw.factbookSnapshot || raw.factbook_snapshot),
    simulated: false,
  };
}

function normalizePermit(raw: Record<string, unknown>): Permit {
  return {
    id: asString(raw.id),
    requestId: asString(raw.requestId || raw.request_id),
    workspaceId: asString(raw.workspaceId || raw.workspace_id),
    agentId: asString(raw.agentId || raw.agent_id),
    policyId: asString(raw.policyId || raw.policy_id),
    message: asString(raw.message),
    destination: asString(raw.destination),
    status: asString(raw.status) as PermitStatus,
    invalidReason: asString(raw.invalidReason || raw.invalid_reason),
  };
}

function normalizePost(raw: Record<string, unknown>): BoardPost {
  return {
    id: asString(raw.id),
    workspaceId: asString(raw.workspaceId || raw.workspace_id),
    agentId: asString(raw.agentId || raw.agent_id),
    message: asString(raw.message),
    publishedAt: asTimestamp(raw.publishedAt || raw.published_at),
    permitId: asString(raw.permitId || raw.permit_id),
  };
}

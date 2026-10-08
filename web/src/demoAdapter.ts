import type {
  Agent,
  AuthorizeAgentInput,
  BoardPost,
  CreateWorkspaceInput,
  DataAdapter,
  DemoIdentity,
  Evaluation,
  EvaluationStatus,
  Permit,
  PolicyVersion,
  ScopeGateState,
  SubmitActionInput,
  Workspace,
} from './domain';

const SCHEMA_VERSION = 1;
const STORE_KEY = 'scopegate-demo-state-v1';
const FACTBOOK = `The beta supports CSV export.
A mobile application is under consideration.
No mobile release date has been announced.
Refund requests must be referred to the support team.`;
const RULES = [
  'R1: Use only product facts supported by the factbook.',
  'R2: Do not invent launch dates or future commitments.',
  'R3: Do not promise refunds or compensation.',
];

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
const walletOk = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);

function activePolicy(state: ScopeGateState, workspaceId: string) {
  const workspace = state.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) throw new Error('Workspace not found.');
  const policy = state.policies.find((item) => item.id === workspace.activePolicyId);
  if (!policy) throw new Error('Active policy not found.');
  return policy;
}

function fixtureFor(message: string, exampleKind?: EvaluationStatus): Pick<Evaluation, 'status' | 'summary' | 'findings' | 'simulated'> {
  const normalized = message.trim();
  if (exampleKind === 'ALLOW' || normalized === 'You can export your beta data as a CSV file.') {
    return {
      status: 'ALLOW',
      summary: 'Simulated fixture: supported by the approved factbook and no future promise is made.',
      findings: ['R1 satisfied by CSV export fact.', 'R2 satisfied; no launch date is asserted.', 'R3 satisfied; no refund promise is made.'],
      simulated: true,
    };
  }
  if (exampleKind === 'DENY' || normalized === 'Our mobile app launches next Friday.') {
    return {
      status: 'DENY',
      summary: 'Simulated fixture: the message invents a mobile launch date.',
      findings: ['R2 fails because the factbook says no mobile release date has been announced.', 'No permit is created.'],
      simulated: true,
    };
  }
  if (exampleKind === 'NEEDS_REVIEW' || normalized === 'We may offer refunds to everyone affected.') {
    return {
      status: 'NEEDS_REVIEW',
      summary: 'Simulated fixture: potential compensation language needs owner review.',
      findings: ['R3 is inconclusive or unsafe for autonomous publication.', 'NEEDS REVIEW does not authorize publication.'],
      simulated: true,
    };
  }
  if (exampleKind === 'EVALUATION_FAILED') {
    return {
      status: 'EVALUATION_FAILED',
      summary: 'Simulated fixture: evaluation service failed before a verdict was available.',
      findings: ['No permit is created for failed evaluations.'],
      simulated: true,
    };
  }
  return {
    status: 'PENDING',
    summary: 'Pending backend evaluation. Custom or edited messages do not receive invented local verdicts.',
    findings: ['No local semantic judge is running in this frontend phase.', 'No permit exists until backend integration returns an ALLOW verdict.'],
    simulated: false,
  };
}

function initialState(): ScopeGateState {
  const policy: PolicyVersion = {
    id: 'policy_orbit_v1',
    workspaceId: 'orbit-product-updates',
    version: 1,
    status: 'ACTIVE',
    mandate: 'Publish accurate product explanations based strictly on the approved public factbook.',
    rules: RULES,
    factbook: FACTBOOK,
    createdAt: now(),
  };
  const workspace: Workspace = {
    id: 'orbit-product-updates',
    name: 'Orbit Product Updates',
    purpose: 'Govern product-support announcements before an integrated community board receives them.',
    board: 'Orbit Community Board',
    ownerAddress: '0x1111111111111111111111111111111111111111',
    activePolicyId: policy.id,
  };
  const agents: Agent[] = [
    {
      id: 'agent_release_bot',
      workspaceId: workspace.id,
      label: 'Orbit Release Bot',
      wallet: '0x2222222222222222222222222222222222222222',
      board: workspace.board,
      messageLimit: 280,
      publicationCap: 1,
      publicationsUsed: 0,
      status: 'ACTIVE',
    },
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    identity: 'owner',
    selectedWorkspaceId: workspace.id,
    workspaces: [workspace],
    policies: [policy],
    agents,
    requests: [],
    evaluations: [],
    permits: [],
    boardPosts: [],
  };
}

function readState(): ScopeGateState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as ScopeGateState;
    if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.workspaces)) return initialState();
    return parsed;
  } catch {
    return initialState();
  }
}

function writeState(state: ScopeGateState) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  return state;
}

export class DemoAdapter implements DataAdapter {
  private state = readState();

  async load() {
    this.state = readState();
    return this.state;
  }

  async loadScope(scope: string, id?: string) {
    // Demo is local and instantaneous, always return full state
    return this.load();
  }

  async reset() {
    this.state = writeState(initialState());
    return this.state;
  }

  async setIdentity(identity: DemoIdentity) {
    this.state = writeState({ ...this.state, identity });
    return this.state;
  }

  async selectWorkspace(selectedWorkspaceId: string) {
    if (!this.state.workspaces.some((workspace) => workspace.id === selectedWorkspaceId)) throw new Error('Workspace not found.');
    this.state = writeState({ ...this.state, selectedWorkspaceId });
    return this.state;
  }

  async createWorkspace(input: CreateWorkspaceInput) {
    if (!input.name.trim() || !input.mandate.trim() || input.rules.filter(Boolean).length === 0) throw new Error('Workspace name, mandate, and rules are required.');
    const workspaceId = id('workspace');
    const policy: PolicyVersion = {
      id: id('policy'),
      workspaceId,
      version: 1,
      status: 'ACTIVE',
      mandate: input.mandate.trim(),
      rules: input.rules.map((rule, index) => `R${index + 1}: ${rule.replace(/^R\d+:\s*/i, '').trim()}`),
      factbook: input.factbook.trim(),
      createdAt: now(),
    };
    const workspace: Workspace = {
      id: workspaceId,
      name: input.name.trim(),
      purpose: input.purpose.trim(),
      board: `${input.name.trim()} Board`,
      ownerAddress: '0x1111111111111111111111111111111111111111',
      activePolicyId: policy.id,
    };
    this.state = writeState({
      ...this.state,
      selectedWorkspaceId: workspaceId,
      workspaces: [...this.state.workspaces, workspace],
      policies: [...this.state.policies, policy],
    });
    return this.state;
  }

  async savePolicyDraft(workspaceId: string, mandate: string, rules: string[], factbook: string) {
    if (this.state.identity !== 'owner') throw new Error('Owner demo identity required.');
    const active = activePolicy(this.state, workspaceId);
    const draft: PolicyVersion = {
      id: id('policy_draft'),
      workspaceId,
      version: active.version + 1,
      status: 'DRAFT',
      mandate,
      rules,
      factbook,
      createdAt: now(),
    };
    this.state = writeState({ ...this.state, policies: [...this.state.policies, draft] });
    return this.state;
  }

  async activateDraft(workspaceId: string, draftId: string) {
    if (this.state.identity !== 'owner') throw new Error('Owner demo identity required.');
    const workspace = this.state.workspaces.find((item) => item.id === workspaceId);
    const draft = this.state.policies.find((item) => item.id === draftId && item.status === 'DRAFT');
    if (!workspace || !draft) throw new Error('Draft not found.');
    const oldPolicyId = workspace.activePolicyId;
    this.state = writeState({
      ...this.state,
      workspaces: this.state.workspaces.map((item) => (item.id === workspaceId ? { ...item, activePolicyId: draftId } : item)),
      policies: this.state.policies.map((item) =>
        item.id === oldPolicyId ? { ...item, status: 'HISTORICAL' } : item.id === draftId ? { ...item, status: 'ACTIVE' } : item,
      ),
      permits: this.state.permits.map((permit) =>
        permit.workspaceId === workspaceId && permit.policyId === oldPolicyId && permit.status === 'READY' ? { ...permit, status: 'INVALIDATED' } : permit,
      ),
    });
    return this.state;
  }

  async authorizeAgent(input: AuthorizeAgentInput) {
    if (this.state.identity !== 'owner') throw new Error('Owner demo identity required.');
    if (!walletOk(input.wallet)) throw new Error('Enter a full 0x wallet address.');
    if (input.messageLimit <= 0 || input.publicationCap <= 0) throw new Error('Limits must be positive integers.');
    const agent: Agent = { id: id('agent'), status: 'ACTIVE', publicationsUsed: 0, ...input };
    this.state = writeState({ ...this.state, agents: [...this.state.agents, agent] });
    return this.state;
  }

  async revokeAgent(agentId: string) {
    if (this.state.identity !== 'owner') throw new Error('Owner demo identity required.');
    this.state = writeState({
      ...this.state,
      agents: this.state.agents.map((agent) => (agent.id === agentId ? { ...agent, status: 'REVOKED' } : agent)),
      permits: this.state.permits.map((permit) => (permit.agentId === agentId && permit.status === 'READY' ? { ...permit, status: 'INVALIDATED' } : permit)),
    });
    return this.state;
  }

  async submitAction(input: SubmitActionInput) {
    if (this.state.identity !== 'agent') throw new Error('Authorized-agent demo identity required.');
    const agent = this.state.agents.find((item) => item.id === input.agentId && item.workspaceId === input.workspaceId);
    if (!agent || agent.status !== 'ACTIVE') throw new Error('Selected agent is not active.');
    if (input.message.length > agent.messageLimit) throw new Error(`Message exceeds ${agent.messageLimit} characters.`);
    const policy = activePolicy(this.state, input.workspaceId);
    const fixture = fixtureFor(input.message, input.exampleKind);
    const requestId = id('request');
    const evaluation: Evaluation = {
      id: id('evaluation'),
      requestId,
      policySnapshot: policy,
      factbookSnapshot: policy.factbook,
      ...fixture,
    };
    let permit: Permit | undefined;
    if (evaluation.status === 'ALLOW') {
      permit = {
        id: id('permit'),
        requestId,
        workspaceId: input.workspaceId,
        agentId: agent.id,
        policyId: policy.id,
        message: input.message,
        destination: agent.board,
        status: 'READY',
      };
    }
    const request = {
      id: requestId,
      workspaceId: input.workspaceId,
      agentId: agent.id,
      message: input.message,
      destination: agent.board,
      createdAt: now(),
      evaluationId: evaluation.id,
      permitId: permit?.id,
      exampleKind: input.exampleKind,
    };
    this.state = writeState({
      ...this.state,
      requests: [request, ...this.state.requests],
      evaluations: [evaluation, ...this.state.evaluations],
      permits: permit ? [permit, ...this.state.permits] : this.state.permits,
    });
    return { state: this.state, requestId };
  }

  async evaluateAction(_requestId: string) {
    return this.state;
  }

  async publish(requestId: string) {
    if (this.state.identity !== 'agent') throw new Error('Authorized-agent demo identity required.');
    const request = this.state.requests.find((item) => item.id === requestId);
    const evaluation = this.state.evaluations.find((item) => item.requestId === requestId);
    const permit = this.state.permits.find((item) => item.requestId === requestId);
    if (!request || !evaluation || !permit) throw new Error('No READY permit is available for this request.');
    const agent = this.state.agents.find((item) => item.id === permit.agentId);
    const workspace = this.state.workspaces.find((item) => item.id === permit.workspaceId);
    if (!agent || agent.status !== 'ACTIVE') throw new Error('Agent authorization is no longer active.');
    if (!workspace || workspace.activePolicyId !== permit.policyId) throw new Error('Permit policy version is no longer active.');
    if (evaluation.status !== 'ALLOW' || permit.status !== 'READY') throw new Error('Only READY permits from ALLOW evaluations can publish.');
    if (request.message !== permit.message || request.destination !== permit.destination) throw new Error('Permit is bound to different content or destination.');
    if (agent.publicationsUsed >= agent.publicationCap) throw new Error('Publication cap reached for this demo agent.');
    const post: BoardPost = {
      id: id('post'),
      workspaceId: request.workspaceId,
      agentId: agent.id,
      message: permit.message,
      publishedAt: now(),
      permitId: permit.id,
    };
    this.state = writeState({
      ...this.state,
      boardPosts: [post, ...this.state.boardPosts],
      permits: this.state.permits.map((item) => (item.id === permit.id ? { ...item, status: 'USED' } : item)),
      agents: this.state.agents.map((item) => (item.id === agent.id ? { ...item, publicationsUsed: item.publicationsUsed + 1 } : item)),
    });
    return this.state;
  }

  async checkTransactionStatus(hash: string) {
    return this.state;
  }

  async refreshPermit(permitId: string) {
    // In demo mode, we just return current state
    return this.state;
  }
}

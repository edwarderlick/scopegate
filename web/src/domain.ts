export type EvaluationStatus =
  | 'PENDING'
  | 'EVALUATING'
  | 'ALLOW'
  | 'DENY'
  | 'NEEDS_REVIEW'
  | 'EVALUATION_FAILED';

export type PermitStatus = 'READY' | 'USED' | 'INVALIDATED';
export type AgentStatus = 'ACTIVE' | 'REVOKED';
export type DemoIdentity = 'owner' | 'agent' | 'viewer';

export interface PolicyVersion {
  id: string;
  workspaceId: string;
  version: number;
  status: 'ACTIVE' | 'DRAFT' | 'HISTORICAL';
  mandate: string;
  rules: string[];
  factbook: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  purpose: string;
  board: string;
  ownerAddress: string;
  activePolicyId: string;
  selected?: boolean;
}

export interface Agent {
  id: string;
  workspaceId: string;
  label: string;
  wallet: string;
  board: string;
  messageLimit: number;
  publicationCap: number;
  publicationsUsed: number;
  status: AgentStatus;
}

export interface Permit {
  id: string;
  requestId: string;
  workspaceId: string;
  agentId: string;
  policyId: string;
  message: string;
  destination: string;
  status: PermitStatus;
  invalidReason?: string;
}

export interface Evaluation {
  id: string;
  requestId: string;
  status: EvaluationStatus;
  summary: string;
  findings: string[];
  structuredFindings?: StructuredFinding[];
  policySnapshot: PolicyVersion;
  factbookSnapshot: string;
  simulated: boolean;
}

export interface StructuredFinding {
  id: string;
  status: 'SATISFIED' | 'VIOLATED' | 'UNCLEAR' | 'SUPPORTED' | 'UNSUPPORTED';
  messageExcerpt: string;
  sourceExcerpt: string;
  explanation: string;
}

export interface ActionRequest {
  id: string;
  workspaceId: string;
  agentId: string;
  message: string;
  destination: string;
  createdAt: string;
  evaluationId: string;
  permitId?: string;
  exampleKind?: EvaluationStatus;
}

export interface BoardPost {
  id: string;
  workspaceId: string;
  agentId: string;
  message: string;
  publishedAt: string;
  permitId: string;
}

export interface ScopeGateState {
  schemaVersion: number;
  mode?: 'demo' | 'live';
  deploymentAddress?: string;
  walletAccount?: string;
  walletChainId?: string;
  identity: DemoIdentity;
  selectedWorkspaceId: string;
  workspaces: Workspace[];
  policies: PolicyVersion[];
  agents: Agent[];
  requests: ActionRequest[];
  evaluations: Evaluation[];
  permits: Permit[];
  boardPosts: BoardPost[];
}

export interface CreateWorkspaceInput {
  name: string;
  purpose: string;
  mandate: string;
  rules: string[];
  factbook: string;
}

export interface AuthorizeAgentInput {
  workspaceId: string;
  label: string;
  wallet: string;
  board: string;
  messageLimit: number;
  publicationCap: number;
}

export interface SubmitActionInput {
  workspaceId: string;
  agentId: string;
  message: string;
  exampleKind?: EvaluationStatus;
}

export interface DataAdapter {
  load(): Promise<ScopeGateState>; // Legacy or initial fast load
  loadScope(scope: 'workspaces' | 'workspaceDetails' | 'actions' | 'board', id?: string): Promise<ScopeGateState>;
  reset(): Promise<ScopeGateState>;
  setIdentity(identity: DemoIdentity): Promise<ScopeGateState>;
  selectWorkspace(id: string): Promise<ScopeGateState>;
  createWorkspace(input: CreateWorkspaceInput): Promise<ScopeGateState>;
  savePolicyDraft(workspaceId: string, mandate: string, rules: string[], factbook: string): Promise<ScopeGateState>;
  activateDraft(workspaceId: string, draftId: string): Promise<ScopeGateState>;
  authorizeAgent(input: AuthorizeAgentInput): Promise<ScopeGateState>;
  revokeAgent(agentId: string): Promise<ScopeGateState>;
  submitAction(input: SubmitActionInput): Promise<{ state: ScopeGateState; requestId: string }>;
  evaluateAction(requestId: string): Promise<ScopeGateState>;
  publish(requestId: string): Promise<ScopeGateState>;
  checkTransactionStatus(hash: string): Promise<ScopeGateState>;
  refreshPermit(permitId: string): Promise<ScopeGateState>;
}

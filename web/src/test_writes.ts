import { LiveAdapter } from './liveAdapter';
import { isSuccessful } from 'genlayer-js';

async function runTests() {
  const dummyWallet = {
    account: '0x1234567890123456789012345678901234567890',
    chainId: 61997,
    provider: {} as any,
  };

  const adapter = new LiveAdapter(
    () => ({ account: dummyWallet.account, chainId: dummyWallet.chainId.toString(), providerName: 'Test' } as any),
    () => dummyWallet.account,
    (s) => {}
  );
  (adapter as any).read = async () => [];
  
  (adapter as any).client = () => ({
    readContract: async ({ functionName, args }: any) => {
      if (functionName === 'get_request_id_for') return 'req1';
      if (functionName === 'get_request') return { id: 'req1', evaluation_id: 'eval1', permit_id: 'permit1' };
      if (functionName === 'get_evaluation') {
        if (args[0] === 'eval1') return { id: 'eval1', status: 'ALLOW', summary: 'auto-eval', findings: [] };
        return { id: args[0], status: 'UNKNOWN', summary: '', findings: [] };
      }
      return [];
    },
    writeContract: async () => '0x_hash',
    estimateTransactionFeesForWrite: async () => ({ distribution: {}, feeValue: 0n }),
    waitForFinalization: async () => ({ status: 1, receipt: { status: 1 } })
  });

  const calls: { method: string; args: any[] }[] = [];
  (adapter as any).write = async (method: string, args: any[]) => {
    calls.push({ method, args });
  };

  // 1. createWorkspace
  await adapter.createWorkspace({ name: 'W', purpose: 'P', mandate: 'M', rules: ['R1'], factbook: 'F' });
  // 2. savePolicyDraft
  await adapter.savePolicyDraft('ws1', 'M', ['R1'], 'F');
  // 3. activateDraft
  await adapter.activateDraft('ws1', 'draft1');
  // 4. authorizeAgent
  await adapter.authorizeAgent({ workspaceId: 'ws1', label: 'L', wallet: '0x0987', messageLimit: 100, publicationCap: 5, board: 'B' });
  // 5. revokeAgent
  await adapter.revokeAgent('agent1');
  // 6. submitAction
  await adapter.submitAction({ workspaceId: 'ws1', agentId: 'agent1', message: 'hello' });
  const midState = await adapter.load();
  if (!midState.requests.find(r => r.id === 'req1')) throw new Error('Request not in state after submitAction');
  if (!midState.evaluations.find(e => e.id === 'eval1' && e.status === 'ALLOW')) throw new Error('Evaluation not fetched and added to state after submitAction');
  console.log('✅ submitAction correctly fetches new evaluation');
  // 7. evaluateAction
  await adapter.evaluateAction('req1');
  // 8. publish
  await adapter.publish('req1');

  // Assertions
  const check = (index: number, name: string, types: string[]) => {
    const call = calls[index];
    if (call.method !== name) throw new Error(`Expected ${name}, got ${call.method}`);
    if (call.args.length !== types.length) throw new Error(`Expected ${types.length} args for ${name}, got ${call.args.length}`);
    for (let i = 0; i < types.length; i++) {
      const type = types[i];
      const val = call.args[i];
      if (type === 'array') {
        if (!Array.isArray(val)) throw new Error(`${name} arg ${i} expected array, got ${typeof val}`);
      } else if (type === 'bigint') {
        if (typeof val !== 'bigint') throw new Error(`${name} arg ${i} expected bigint, got ${typeof val}`);
      } else {
        if (typeof val !== type) throw new Error(`${name} arg ${i} expected ${type}, got ${typeof val}`);
      }
    }
    console.log(`✅ ${name} signature matches`);
  };

  // 1. create_workspace(client_nonce: str, name: str, purpose: str, mandate: str, rules: list[str], factbook: str)
  check(0, 'create_workspace', ['string', 'string', 'string', 'string', 'array', 'string']);
  // 2. save_policy_draft(workspace_id: str, client_nonce: str, mandate: str, rules: list[str], factbook: str)
  check(1, 'save_policy_draft', ['string', 'string', 'string', 'array', 'string']);
  // 3. activate_draft(workspace_id: str, draft_id: str)
  check(2, 'activate_draft', ['string', 'string']);
  // 4. authorize_agent(workspace_id: str, client_nonce: str, label: str, wallet: Address, message_limit: u256, publication_cap: u256)
  check(3, 'authorize_agent', ['string', 'string', 'string', 'object', 'bigint', 'bigint']);
  // 5. revoke_agent(agent_id: str)
  check(4, 'revoke_agent', ['string']);
  // 6. submit_action(workspace_id: str, agent_id: str, client_nonce: str, message: str)
  check(5, 'submit_action', ['string', 'string', 'string', 'string']);
  // 7. evaluate_request(request_id: str)
  check(6, 'evaluate_request', ['string']);
  // 8. publish(request_id: str)
  check(7, 'publish', ['string']);

  console.log('All writes validated against mocked contract signatures.');

  // --- Regression test for MAJORITY_DISAGREE ---
  globalThis.localStorage = {
    store: {} as Record<string, string>,
    get length() { return Object.keys(this.store).length; },
    key(i: number) { return Object.keys(this.store)[i] || null; },
    getItem(key: string) { return this.store[key] || null; },
    setItem(key: string, value: string) { this.store[key] = value; },
    removeItem(key: string) { delete this.store[key]; }
  } as any;

  let caughtDisagreement = false;
  try {
    const errorAdapter = new LiveAdapter(
      () => dummyWallet as any,
      () => dummyWallet.account,
      undefined
    );

    const fixtureReceipt = {
      status: 7,
      statusName: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
      result_name: "MAJORITY_DISAGREE",
      lifecycle: { outcome: "undetermined" },
    };

    if (!isSuccessful(fixtureReceipt as any)) {
      throw new Error('SDK isSuccessful() should return true for this fixture.');
    }
    console.log('✅ SDK isSuccessful() returned true for the fixture.');

    (errorAdapter as any).client = () => ({
      waitForFinalization: async () => fixtureReceipt
    });
    
    globalThis.localStorage.setItem('last-eval-tx-req-disagree', '0x123');
    await errorAdapter.checkTransactionStatus('0x123');
  } catch (e: any) {
    if (e.message.includes('majority disagreed')) {
      caughtDisagreement = true;
      if (globalThis.localStorage.getItem('last-eval-outcome-req-disagree') !== 'disagreed') {
         throw new Error('Did not store last-eval-outcome as disagreed');
      }
      console.log('✅ Correctly caught consensus disagreement and set local state.');
    } else {
      throw new Error('Unexpected error message: ' + e.message);
    }
  }
  if (!caughtDisagreement) throw new Error('Did not catch consensus disagreement');
}

runTests().catch(e => {
  console.error(e);
  // @ts-ignore
  process.exit(1);
});

import { createClient, isSuccessful } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { GENLAYER_CHAIN, type Eip1193Provider } from './wallet';

type DeploymentReceipt = {
  hash?: string;
  txId?: string;
  txDataDecoded?: { contractAddress?: string };
  lifecycle?: unknown;
  statusName?: string;
  txExecutionResultName?: string;
};

const DEPLOY_FEE_OPTIONS = {
  leaderTimeunitsAllocation: 400n,
  validatorTimeunitsAllocation: 600n,
  appealRounds: 1n,
  executionBudgetPerRound: 25_000_000_000_000_000n,
  totalMessageFees: 0n,
  rotations: [1n, 1n],
};

const root = document.querySelector<HTMLElement>('#deploy-root');
if (!root) throw new Error('Deploy root not found.');

root.innerHTML = `
  <section class="shell">
    <header>
      <p class="eyebrow">ScopeGate Studio-dev deployment</p>
      <h1>Deploy with browser wallet</h1>
      <p class="lede">Use a funded wallet on chain 61997, select <code>contracts/scopegate.py</code>, and deploy without exposing a private key to this repo.</p>
    </header>
    <div class="panel">
      <label>
        Contract source
        <input id="contract-file" type="file" accept=".py,text/x-python,text/plain" />
      </label>
      <button id="deploy-button" type="button">Connect, estimate, deploy</button>
      <pre id="status" aria-live="polite">Waiting for contract file.</pre>
    </div>
  </section>
`;

const style = document.createElement('style');
style.textContent = `
  :root {
    color: #18211f;
    background: #f7f4ec;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  body { margin: 0; min-height: 100vh; }
  .shell { max-width: 840px; margin: 0 auto; padding: 64px 24px; }
  .eyebrow { color: #60736c; font-size: 13px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
  h1 { margin: 8px 0 14px; font-size: clamp(36px, 7vw, 68px); line-height: 0.95; letter-spacing: 0; }
  .lede { max-width: 700px; color: #40504b; font-size: 18px; line-height: 1.55; }
  .panel { margin-top: 34px; border: 1px solid #d8d0c0; border-radius: 8px; background: #fffaf0; padding: 22px; display: grid; gap: 18px; }
  label { display: grid; gap: 8px; font-size: 14px; font-weight: 700; color: #30413c; }
  input { border: 1px solid #cfc7b8; border-radius: 6px; padding: 12px; background: #fff; font: inherit; }
  button { width: fit-content; min-height: 42px; border: 0; border-radius: 6px; background: #193c35; color: #fff; padding: 0 18px; font-weight: 800; cursor: pointer; }
  button:disabled { opacity: 0.55; cursor: progress; }
  pre { min-height: 220px; margin: 0; overflow: auto; border-radius: 6px; background: #101615; color: #d8f4e5; padding: 16px; line-height: 1.5; white-space: pre-wrap; }
  code { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace; }
`;
document.head.appendChild(style);

const fileInput = document.querySelector<HTMLInputElement>('#contract-file');
const button = document.querySelector<HTMLButtonElement>('#deploy-button');
const statusBox = document.querySelector<HTMLPreElement>('#status');

function setStatus(message: string) {
  if (statusBox) statusBox.textContent = message;
}

function stringifyWithBigInts(value: unknown) {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === 'bigint' ? item.toString() : item),
    2,
  );
}

async function sha256Hex(source: string) {
  const bytes = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function selectedContractSource() {
  const file = fileInput?.files?.[0];
  if (!file) throw new Error('Select contracts/scopegate.py before deploying.');
  const source = await file.text();
  if (!source.includes('class ScopeGate(gl.Contract)')) throw new Error('Selected file does not look like contracts/scopegate.py.');
  return { source, hash: await sha256Hex(source) };
}

async function ensureStudioDev(provider: Eip1193Provider) {
  const chainId = ((await provider.request({ method: 'eth_chainId' })) as string | undefined)?.toLowerCase();
  if (chainId === GENLAYER_CHAIN.chainId.toLowerCase()) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: GENLAYER_CHAIN.chainId }] });
  } catch {
    await provider.request({ method: 'wallet_addEthereumChain', params: [GENLAYER_CHAIN] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: GENLAYER_CHAIN.chainId }] });
  }
}

async function deploy() {
  if (!button) return;
  button.disabled = true;
  try {
    const provider = window.ethereum;
    if (!provider) throw new Error('No injected wallet found.');
    const { source, hash: sourceHash } = await selectedContractSource();
    setStatus(`Selected contract SHA-256:\n${sourceHash}\n\nRequesting wallet account...`);
    setStatus('Requesting wallet account...');
    const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
    const account = accounts[0];
    if (!account) throw new Error('Wallet did not return an account.');
    setStatus(`Using ${account}. Switching to Studio-dev...`);
    await ensureStudioDev(provider);

    const client = createClient({ chain: studioDevnet, account: account as `0x${string}`, provider: provider as never });
    setStatus(`Selected contract SHA-256:\n${sourceHash}\n\nEstimating live Studio-dev deploy fee...`);
    const estimate = await client.estimateTransactionFees(DEPLOY_FEE_OPTIONS);
    const estimateText = stringifyWithBigInts({
      sourceSha256: sourceHash,
      feeValue: estimate.feeValue,
      distribution: estimate.distribution,
      policy: estimate.policy,
    });
    setStatus(`Live deploy fee estimate. No transaction has been submitted yet.\n\n${estimateText}`);
    const shouldDeploy = window.confirm(`Deploy ScopeGate with this fee estimate?\n\nSHA-256: ${sourceHash}\nFee value: ${estimate.feeValue.toString()}`);
    if (!shouldDeploy) {
      setStatus(`Deployment stopped before wallet signing.\n\n${estimateText}`);
      return;
    }
    setStatus(`Submitting deploy transaction. Confirm in your wallet.\n\n${estimateText}`);
    const hash = await client.deployContract({
      code: source,
      fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
    });
    setStatus(`Deploy submitted:\n${hash}\n\nWaiting for finalization...`);
    const receipt = (await client.waitForFinalization({ hash: hash as never, fullTransaction: true })) as DeploymentReceipt;
    const contractAddress = receipt.txDataDecoded?.contractAddress;
    const executionOk = isSuccessful(receipt as never) && receipt.txExecutionResultName === 'FINISHED_WITH_RETURN';
    let deployedCode = '';
    let sourceReadError = '';
    if (contractAddress) {
      try {
        deployedCode = await client.getContractCode(contractAddress as `0x${string}`);
      } catch (caught) {
        sourceReadError = caught instanceof Error ? caught.message : String(caught);
      }
    }
    const deployedHash = deployedCode ? await sha256Hex(deployedCode) : '';
    const sourceMatches = deployedCode === source;
    const deploymentUsable = executionOk && deployedCode !== '' && sourceMatches;
    setStatus(
      [
        deploymentUsable
          ? 'Deployment finalized and source verified successfully.'
          : 'Deployment is not usable yet. Do not configure the app with this address.',
        `Transaction hash: ${hash}`,
        `Finalized execution check: ${executionOk ? 'PASS' : 'FAIL'}`,
        `Execution result: ${receipt.txExecutionResultName ?? 'unknown'}`,
        `Selected source SHA-256: ${sourceHash}`,
        contractAddress ? `Unverified contract address: ${contractAddress}` : 'Contract address was not present in txDataDecoded.',
        deployedHash ? `Deployed source SHA-256: ${deployedHash}` : 'Deployed source could not be read back.',
        sourceReadError ? `Source read-back error: ${sourceReadError}` : '',
        contractAddress ? `Deployed source comparison: ${sourceMatches ? 'MATCH' : 'MISMATCH'}` : '',
        '',
        deploymentUsable
          ? `Verified contract address for VITE_SCOPEGATE_CONTRACT_ADDRESS=${contractAddress}`
          : 'No usable deployment address is available until finalized execution and source hash verification both pass.',
        '',
        stringifyWithBigInts(receipt),
      ].join('\n'),
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    setStatus(`Deployment failed:\n${message}`);
  } finally {
    button.disabled = false;
  }
}

button?.addEventListener('click', () => {
  void deploy();
});

fileInput?.addEventListener('change', () => {
  void selectedContractSource()
    .then(({ hash }) => setStatus(`Selected contract SHA-256:\n${hash}\n\nReady to connect and estimate.`))
    .catch((caught) => setStatus(caught instanceof Error ? caught.message : String(caught)));
});

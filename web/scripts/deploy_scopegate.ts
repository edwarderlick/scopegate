import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient, isSuccessful } from 'genlayer-js';
import { studioDevnet } from 'genlayer-js/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { validateContractSource } from '../src/deploy_source_validator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPECTED_RAW_SHA256 = 'beb4652cc49a5f6888b7801c397983223f3caaca73c3844f94c3c34b59bd2e22';

const DEPLOY_FEE_OPTIONS = {
  leaderTimeunitsAllocation: 400n,
  validatorTimeunitsAllocation: 600n,
  appealRounds: 1n,
  executionBudgetPerRound: 25_000_000_000_000_000n,
  totalMessageFees: 0n,
  rotations: [1n, 1n],
};

function sha256Hex(bufferOrStr) {
  const hash = crypto.createHash('sha256');
  hash.update(bufferOrStr);
  return hash.digest('hex');
}

async function main() {
  console.log('=== ScopeGate Autonomous Studio-dev Deployment ===');

  // 1. Read & validate source
  const contractPath = path.resolve(__dirname, '../../contracts/scopegate.py');
  const sourceBytes = fs.readFileSync(contractPath);
  const sourceText = sourceBytes.toString('utf8');

  validateContractSource(sourceText);
  const rawHash = sha256Hex(sourceBytes);
  console.log(`Contract path: ${contractPath}`);
  console.log(`Computed raw SHA-256: ${rawHash}`);

  if (rawHash !== EXPECTED_RAW_SHA256) {
    throw new Error(`Hash mismatch: expected ${EXPECTED_RAW_SHA256}, got ${rawHash}`);
  }
  console.log('✓ Contract source verified and matches expected SHA-256.');

  // 2. Load deployer account from local OS keychain
  const keytarMod = await import('file:///C:/Users/samir/AppData/Roaming/npm/node_modules/genlayer/node_modules/keytar/lib/keytar.js');
  const keytar = keytarMod.default ?? keytarMod;
  const accountName = 'coverlock-submitter';
  const rawKey = await keytar.getPassword('genlayer-cli', `account:${accountName}`);
  if (!rawKey) {
    throw new Error(`Failed to retrieve unlocked key for account ${accountName} from OS keychain.`);
  }

  const account = privateKeyToAccount(rawKey);
  console.log(`Deployer account: ${accountName} (${account.address})`);

  // 3. Connect client
  const client = createClient({ chain: studioDevnet, account });
  const balance = await client.getBalance({ address: account.address });
  console.log(`Deployer balance: ${balance.toString()} wei (~${Number(balance) / 1e18} GEN)`);

  if (balance < 500_000_000_000_000_000n) {
    throw new Error(`Deployer balance too low: ${balance.toString()}`);
  }

  // 4. Estimate fees
  console.log('Estimating deployment fees on Studio-dev...');
  const estimate = await client.estimateTransactionFees(DEPLOY_FEE_OPTIONS);
  console.log(`Estimated fee value: ${estimate.feeValue.toString()} wei`);
  console.log('Fee distribution:', JSON.stringify(estimate.distribution, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

  // 5. Submit deploy transaction
  console.log('Submitting deployContract transaction...');
  const hash = await client.deployContract({
    code: sourceText,
    fees: { distribution: estimate.distribution, feeValue: estimate.feeValue },
  });
  console.log(`>>> Deployment submitted! Tx Hash: ${hash}`);

  // 6. Wait for finalization
  console.log('Waiting for transaction finalization...');
  const receipt = await client.waitForFinalization({ hash, fullTransaction: true });
  console.log('Finalized receipt status:', receipt.statusName ?? receipt.status);
  console.log('Execution result name:', receipt.txExecutionResultName);

  const contractAddress = receipt.txDataDecoded?.contractAddress ?? receipt.data?.contract_address;
  if (!contractAddress) {
    console.error('Receipt dump:', JSON.stringify(receipt, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    throw new Error('Contract address not found in receipt!');
  }

  const ok = isSuccessful(receipt) && receipt.txExecutionResultName === 'FINISHED_WITH_RETURN';
  if (!ok) {
    throw new Error(`Deployment execution failed: ${receipt.txExecutionResultName}`);
  }
  console.log(`✓ Deployment finalized! Contract address: ${contractAddress}`);

  // 7. Read back deployed code and verify
  console.log('Reading back deployed source code from chain...');
  const deployedSource = await client.getContractCode(contractAddress);
  const deployedHash = sha256Hex(Buffer.from(deployedSource, 'utf8'));
  console.log(`Deployed source SHA-256: ${deployedHash}`);

  if (deployedHash !== rawHash && sha256Hex(Buffer.from(deployedSource.replace(/\r\n/g, '\n'), 'utf8')) !== sha256Hex(Buffer.from(sourceText.replace(/\r\n/g, '\n'), 'utf8'))) {
    throw new Error(`Deployed code hash mismatch! Deployed: ${deployedHash}, Expected: ${rawHash}`);
  }
  console.log('✓ Deployed source matches submitted source exactly.');

  console.log('\n=== DEPLOYMENT SUMMARY ===');
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Deploy Transaction Hash: ${hash}`);
  console.log(`Deployer Address: ${account.address}`);
  console.log(`Source SHA-256: ${rawHash}`);

  // Write deployment result to a JSON file for subsequent test flows
  fs.writeFileSync(
    path.resolve(__dirname, 'deployment_result.json'),
    JSON.stringify({
      contractAddress,
      deployTxHash: hash,
      deployer: account.address,
      sourceSha256: rawHash,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );
  console.log('Saved deployment result to scripts/deployment_result.json');
}

main().catch((err) => {
  console.error('Deployment failed:', err);
  process.exit(1);
});

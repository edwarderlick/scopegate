import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContractSource } from './deploy_source_validator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runDeploySelectionTests() {
  console.log('Running deployment selection tests...');

  // 1. Positive test: Real checked-in contracts/scopegate.py
  const contractPath = path.resolve(__dirname, '../../contracts/scopegate.py');
  if (!fs.existsSync(contractPath)) {
    throw new Error(`contracts/scopegate.py not found at ${contractPath}`);
  }
  const realSource = fs.readFileSync(contractPath, 'utf8');

  try {
    validateContractSource(realSource);
    console.log('✅ Real contracts/scopegate.py passed deployment selection.');
  } catch (err) {
    console.error('❌ Real contracts/scopegate.py failed deployment selection:', err);
    throw err;
  }

  // 2. Negative test: Unrelated Python file
  const unrelatedSource = `
# Unrelated script
def hello():
    print("This is not ScopeGate")
`;
  let negativePassed = false;
  try {
    validateContractSource(unrelatedSource);
  } catch {
    negativePassed = true;
    console.log('✅ Unrelated Python source correctly rejected by deployment selection.');
  }

  if (!negativePassed) {
    throw new Error('Negative test failed: unrelated Python file was accepted!');
  }

  console.log('All deployment selection tests passed.');
}

runDeploySelectionTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

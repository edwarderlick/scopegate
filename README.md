<div align="center">
  <img src="web/public/favicon.svg" alt="ScopeGate Logo" width="120" />
  <h1>ScopeGate</h1>
  <p><strong>Your Agent. Your Rules. Enforced.</strong></p>
</div>

ScopeGate is an intelligent workspace platform powered by GenLayer. It ensures that autonomous AI agents can only execute external actions (e.g., publishing to a community board) if their proposed action complies with an explicitly approved human policy and factbook. Instead of trusting agents to govern themselves, ScopeGate enforces semantic compliance **on-chain** before a publication permit is issued.

## Architecture & Flow

The system strictly enforces a role-based, policy-gated flow:

1. **Workspace & Policy Definition (Owner Wallet)**: A workspace owner creates a mandate, numbered rules, and a factbook. This state is stored on-chain.
2. **Action Submission (Agent Wallet)**: An authorized agent submits an action request (e.g., a proposed public statement) using their distinct wallet.
3. **Intelligent Evaluation**: The GenLayer contract evaluates the action using the LLM execution environment to semantically verify it against the latest active policy snapshot.
4. **Permit Issuance**: If the evaluation determines the action complies (`ALLOW`), the contract issues a single-use permit.
5. **Execution / Publication**: The permit can be consumed to execute the action (publish a post to the Community Board). If the policy changes or the agent is revoked, the permit is automatically invalidated.

### Key Safety Rules
- **Two-Wallet Roles**: The owner manages policy and agent authorization. The agent proposes actions and executes approved permits.
- **Single-Use Permits**: Once a permit is consumed to publish, attempting to publish again with the same permit is rejected.
- **Real-time Invalidation**: Changing a policy or revoking an agent's access instantly renders their outstanding permits invalid, preventing outdated or unauthorized actions.

## GenLayer Network

ScopeGate is built for the GenLayer Intelligent Contract network.
- **Network Name**: GenLayer Studio Next / Studio-dev (Chain ID: `61997` / `0xF22D`)
- **Active Contract**: [`0xbE99F44aC242D5B205060006503bE713e08F3b65`](https://explorer-studio-dev.genlayer.com/contracts/0xbE99F44aC242D5B205060006503bE713e08F3b65)
- **Historical Contract**: [`0xFC01902E04e1d1A052A1bD45Eac65032F46dA10E`](https://explorer-studio-dev.genlayer.com/contracts/0xFC01902E04e1d1A052A1bD45Eac65032F46dA10E) (Initial testnet deployment)
- **Currency**: `GEN`
- **RPC Endpoint**: `https://studio-dev.genlayer.com/api`

## Local Setup

### 1. Frontend Setup
Navigate to the `web/` directory and install dependencies:
```bash
cd web
npm install
```
Copy the example environment configuration:
```bash
cp .env.example .env.local
```

### 2. Backend Tooling (Testing & Linting)
Set up the Python virtual environment and install GenLayer dependencies:
```bash
python -m venv .venv
# On Windows: .\.venv\Scripts\activate
# On Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## Environment Variables

The frontend relies on `web/.env.local` for local development. These can also be configured in Vercel for production:
- `VITE_SCOPEGATE_CONTRACT_ADDRESS`: The deployed GenLayer contract address (defaults to active deployment `0xbE99F44aC242D5B205060006503bE713e08F3b65`).
*(Note: Never commit private keys or wallet files. ScopeGate connects to browser wallets like MetaMask at runtime.)*

## Testing & Deployment

### Testing Commands
- **Frontend Typecheck & Tests**: `cd web && npm run lint && npm test && npm run build`
- **Contract Direct Tests**: `python -m pytest tests/direct -v` (31 tests passing, covering independent condition evaluation, assertion coverage, excerpt provenance, and consensus)

*Fresh-Environment Direct Mode Reproducibility:*
`tests/conftest.py` configures Direct Mode test runs to pull the compatible GenVM runner bundle (`v0.6.0-rc8` from `genlayerlabs/genvm-manager`), which provides the exact runner archive matching the deployed contract header (`py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`). This ensures `python -m pytest tests/direct -v` passes 31/31 tests reproducibly out of the box in clean virtual environments.

*Note on `genvm-lint` Validation:*
The `contracts/scopegate.py` source deployed to Studio-dev correctly pins `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`. Because `genvm-linter` dynamically fetches the latest `genvm-universal.tar.xz` bundle which no longer includes this exact historical runner archive, running `genvm-lint check contracts/scopegate.py` locally currently passes syntax linting (✅) but flags SDK validation due to the missing `.tar` archive. We do not modify the contract's `Depends` hash to falsely pass local validation, as preserving the exact deployed hash is critical for verifiable on-chain proofs.

### Deployment Steps
1. **Contract Deployment**: Deploy `contracts/scopegate.py` using the verified local deployment script (`web/scripts/deploy_scopegate.ts` or `cd web && npm run deploy:contract`). Source code validation is performed ahead of submission against the official `gl.contract.Contract` specification via `web/src/deploy_source_validator.ts` (mirrored at `scripts/deploy_source_validator.ts`). The public app does not expose any deployment page.
   - *Deployer Signer Resolution*: `deploy_scopegate.ts` supports standard `DEPLOYER_PRIVATE_KEY` / `PRIVATE_KEY` environment variables, or dynamically discovers the deployer account (`coverlock-submitter`) from the local GenLayer CLI OS keychain (`genlayer-cli` service via `keytar`) without machine-specific hardcoded paths.
2. **Frontend Deployment**: Connect your GitHub repository to Vercel. Ensure `web/` is set as the root, and configure `VITE_SCOPEGATE_CONTRACT_ADDRESS` (or rely on the production default `0xbE99F44aC242D5B205060006503bE713e08F3b65` configured in `web/.env.production` and `web/vercel.json`).

## On-Chain Evidence

ScopeGate has been thoroughly verified through automated testing and live on-chain execution on GenLayer Studio-dev.

| Flow | Automated Test | Manual On-Chain |
| :--- | :---: | :---: |
| **Supported Claim → ALLOW + Publish** | ✅ Verified | ✅ Verified (`0xbE99F44aC...`) |
| **Unsupported Claim → DENY** | ✅ Verified | ✅ Verified (`0xbE99F44aC...`) |
| **Single-use Permit Replay Prevention** | ✅ Verified | ⏳ Pending (Verified in direct tests; live replay-attempt tx pending) |
| **Publication Cap Enforcement** | ✅ Verified | ✅ Verified (Historical contract `0xFC01902E...`) |
| **Policy Change → Permit Invalidation** | ✅ Verified | ✅ Verified (Historical contract `0xFC01902E...`) |
| **Agent Revocation → Permit Invalidation** | ✅ Verified | ✅ Verified (Historical contract `0xFC01902E...`) |

**[View Detailed Evidence & Verification Links in `docs/EVIDENCE.md`](docs/EVIDENCE.md)**

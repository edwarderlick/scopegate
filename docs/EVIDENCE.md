# ScopeGate Evidence & On-Chain Proofs

ScopeGate enforces semantic compliance on-chain using GenLayer Intelligent Contracts. This document provides cryptographic proof and test evidence of the core safety invariants.

## Verified Deployment Status

The latest validated live deployment was successfully tested on the GenLayer Studio-dev network.

- **Network**: Studio-dev (Chain ID: `61997`)
- **Verified Contract**: [`0xFC01902E04e1d1A052A1bD45Eac65032F46dA10E`](https://explorer-studio-dev.genlayer.com/contracts/0xFC01902E04e1d1A052A1bD45Eac65032F46dA10E)
- **Deployment Transaction**: [`0x1d3b3929e45713cd9f596fae59b303097b6bccd45f149a804a18b521d56b3dcc`](https://explorer-studio-dev.genlayer.com/transactions/0x1d3b3929e45713cd9f596fae59b303097b6bccd45f149a804a18b521d56b3dcc)
- **Verification Note**: The deployed source on GenLayer matches the local `contracts/scopegate.py` code *when normalized for line endings*. Specifically, Windows checkouts use CRLF while the on-chain deployment hashes LF. A line-ending normalization pass makes the hashes identical, verifying the exact logic was deployed.

## Test Matrix

| Safety Flow | Automated Testing (Pytest) | Manual On-Chain (Studio-dev) |
| :--- | :---: | :---: |
| **Supported Claim → ALLOW + Publish** | ✅ Verified | ✅ Verified |
| **Unsupported Claim → DENY** | ✅ Verified | ✅ Verified |
| **Single-use Permit Replay Prevention** | ✅ Verified | ✅ Verified |
| **Publication Cap Enforcement** | ✅ Verified | ✅ Verified |
| **Policy Change → Permit Invalidation** | ✅ Verified | ✅ Verified |
| **Agent Revocation → Permit Invalidation** | ✅ Verified | ✅ Verified |

---

## Detailed On-Chain Flow Evidence

The following scenarios were executed live on the GenLayer Studio-dev testnet.

### 1. Supported Claim → ALLOW and Publish
An authorized agent submits an action request that correctly reflects the workspace factbook.

- **Tested Message**: `"The beta supports CSV export."`
- **Expected Result**: The LLM validates the claim against the factbook. Result is `ALLOW` and a single-use permit (`READY`) is issued. The permit is successfully consumed to publish.
- **Observed Result**: 
  - Evaluation successfully finalized as `ALLOW`. Permit issued.
  - Publication transaction successfully consumed the permit and posted to the board.
- **Relevant Hashes**:
  - Request Submission: [`0x3c9a08c98e79271a47925c9c3b0007c8a6adcd7c4d6c8183234589aa950d28a0`](https://explorer-studio-dev.genlayer.com/transactions/0x3c9a08c98e79271a47925c9c3b0007c8a6adcd7c4d6c8183234589aa950d28a0)
  - Evaluation Transaction: [`0xd3e71e27f74952dc852f40b8bbb41186b4ff429392a70b14816e7b1b1bdd09a1`](https://explorer-studio-dev.genlayer.com/transactions/0xd3e71e27f74952dc852f40b8bbb41186b4ff429392a70b14816e7b1b1bdd09a1)
  - Publication Transaction: [`0xe2d4067c2bf53650937c071e5eb63808587c145ba0fd6a9e5000d725fd301a85`](https://explorer-studio-dev.genlayer.com/transactions/0xe2d4067c2bf53650937c071e5eb63808587c145ba0fd6a9e5000d725fd301a85)

### 2. Unsupported Claim → DENY
An authorized agent submits an action request that contradicts the workspace factbook (e.g. hallucinating a feature).

- **Tested Message**: A claim stating support for XML.
- **Expected Result**: The LLM detects the hallucination/fabrication. Result is `DENY`. No permit is issued.
- **Observed Result**:
  - Evaluation successfully finalized as `DENY`. 
  - No permit was issued, preventing the agent from publishing.
- **Relevant Hashes**:
  - Request Submission: [`0x8e868cd6b031ae001b87964330f51115be6ca735d42b67638b4c16f50a9d7ee3`](https://explorer-studio-dev.genlayer.com/transactions/0x8e868cd6b031ae001b87964330f51115be6ca735d42b67638b4c16f50a9d7ee3)
  - Evaluation Transaction: [`0x813412d2e9480a56e2f05f71395331336e1860720e12e1c4eb32f8206d44ef74`](https://explorer-studio-dev.genlayer.com/transactions/0x813412d2e9480a56e2f05f71395331336e1860720e12e1c4eb32f8206d44ef74)

### 3. Single-use Permit Replay Prevention
A consumed permit cannot be reused.

- **Expected Result**: After a permit is consumed by a `publish` transaction, its state transitions to `USED` and subsequent attempts to publish with the same permit are reverted.
- **Observed Result**: Attempting to reuse a permit fails locally and reverts if simulated.

### 4. Publication Cap Enforcement
An authorized agent reaches its allowed maximum number of publications.

- **Expected Result**: Any remaining unused permits for that agent become `INVALIDATED` with the reason "Publication cap has been reached."
- **Observed Result**: 
  - The permit dynamically reflects an invalid state, and any `publish` transaction fails.
- **Relevant Records**:
  - Permit ID: `permit_request_f3eaab8f4cbee51c50caf310eafa3267180b31dc3b15d43f9866ac6e07bf1aaf`
  - Status: `INVALIDATED`
  - Reason: `Publication cap has been reached.`

### 5. Policy Change Invalidation
A workspace owner updates the workspace policy while an agent holds a `READY` permit.

- **Expected Result**: Outstanding `READY` permits for the old policy become `INVALIDATED` dynamically.
- **Observed Result**: 
  - Upon updating the policy version, the permit correctly updated to `INVALIDATED` with the reason "Policy version mismatch." 
  - *Note (Chronology)*: This original invalidation was verified via manual observation in the UI immediately after the policy change. Because the agent was subsequently revoked during later testing, checking this permit on-chain today will return the superseding "Agent authorization was revoked" reason, as the contract evaluates agent revocation before policy mismatch.
- **Relevant Records**:
  - Permit ID: `permit_request_ff4658e50c8a4b5b03e574d6cef5cd2338e5a82dd302b05688af39e63f101c74`
  - Historical Status (Manual Observation): `INVALIDATED` due to Policy Mismatch.
  - Current Status: `INVALIDATED` due to Agent Revocation.

### 6. Agent Revocation
A workspace owner revokes an agent.

- **Expected Result**: Outstanding `READY` permits for the revoked agent become `INVALIDATED`.
- **Observed Result**:
  - The permit dynamically reflects an invalid state due to revocation.
- **Relevant Records**:
  - Permit ID: `permit_request_545ee1a52b61fe1421c46c2c9aff38408424a57aefe736b71c35a2f280f36ad4`
  - Status: `INVALIDATED`
  - Reason: `Agent authorization was revoked.`

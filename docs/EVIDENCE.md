# ScopeGate Evidence & On-Chain Proofs

ScopeGate enforces semantic compliance on-chain using GenLayer Intelligent Contracts. This document provides cryptographic proof and test evidence of the core safety invariants.

## Verified Deployment Status

The latest validated live deployment was successfully tested on the GenLayer Studio-dev network.

- **Network**: Studio-dev (Chain ID: `61997`)
- **Verified Contract**: [`0xFC01902E04e1d1A052A1bD45Eac65032F46dA10E`](https://explorer-studio-dev.genlayer.com/contracts/0xFC01902E04e1d1A052A1bD45Eac65032F46dA10E)
- **Deployment Transaction**: [`0x1d3b3929e45713cd9f596fae59b303097b6bccd45f149a804a18b521d56b3dcc`](https://explorer-studio-dev.genlayer.com/transactions/0x1d3b3929e45713cd9f596fae59b303097b6bccd45f149a804a18b521d56b3dcc)
- **Verification Note**: The deployed source on GenLayer was confirmed to match the local `contracts/scopegate.py` source byte-for-byte at the time of deployment. Minor local comment formatting updates may have occurred since, but the core logic remains identically tested.

## Test Matrix

| Safety Flow | Automated Testing (Pytest) | Manual On-Chain (Studio-dev) |
| :--- | :---: | :---: |
| **Supported Claim → ALLOW + Publish** | ✅ Verified | ✅ Verified |
| **Unsupported Claim → DENY** | ✅ Verified | ✅ Verified |
| **Publication Cap (Cannot reuse permit)** | ✅ Verified | ⏳ Pending (Tested locally) |
| **Policy Change → Permit Invalidation** | ✅ Verified | ⏳ Pending (Tested locally) |
| **Agent Revocation → Permit Invalidation** | ✅ Verified | ⏳ Pending (Tested locally) |

---

## Detailed On-Chain Flow Evidence

The following scenarios were executed live on the GenLayer Studio-dev testnet using an identical factbook:

### 1. Supported Claim → ALLOW and Publish
An authorized agent submits an action request that correctly reflects the workspace factbook.

- **Tested Message**: `"The beta supports CSV export."`
- **Expected Result**: The LLM validates the claim against the factbook. Result is `ALLOW` and a single-use permit (`READY`) is issued. The permit is successfully consumed to publish.
- **Observed Result**: 
  - Evaluation successfully finalized as `ALLOW`. Permit issued.
  - Publication transaction successfully consumed the permit and posted to the board.
- **Relevant Hashes**:
  - Request Submission: [`0x3c9a08c98e79271a47925c9c3b0007c8a6adcd7c4d6c8183234589aa950d28a0`](https://explorer-studio-dev.genlayer.com/transactions/0x3c9a08c98e79271a47925c9c3b0007c8a6adcd7c4d6c8183234589aa950d28a0)
  - Evaluation Transaction: [`0xd3e71e27f74952dc852f40b8bbb41186b4ff429392a70b14816e7b1b1bdd09a1`](https://explorer-studio-dev.genlayer.com/transactions/0xd3e71e27f74952dc852f40b8bbb41186b4ff429392a70b14816e7b1b1bdd09a1) (Status: `ALLOW`, `MAJORITY_AGREE`)
  - Publication Transaction: [`0xe2d4067c2bf53650937c071e5eb63808587c145ba0fd6a9e5000d725fd301a85`](https://explorer-studio-dev.genlayer.com/transactions/0xe2d4067c2bf53650937c071e5eb63808587c145ba0fd6a9e5000d725fd301a85)

### 2. Unsupported Claim → DENY
An authorized agent submits an action request that contradicts the workspace factbook (e.g. hallucinating a feature).

- **Tested Message**: A claim stating support for XML (when the factbook only states CSV support).
- **Expected Result**: The LLM detects the hallucination/fabrication. Result is `DENY`. No permit is issued.
- **Observed Result**:
  - Evaluation successfully finalized as `DENY`. 
  - No permit was issued, preventing the agent from publishing.
- **Relevant Hashes**:
  - Request Submission: [`0x8e868cd6b031ae001b87964330f51115be6ca735d42b67638b4c16f50a9d7ee3`](https://explorer-studio-dev.genlayer.com/transactions/0x8e868cd6b031ae001b87964330f51115be6ca735d42b67638b4c16f50a9d7ee3)
  - Evaluation Transaction: [`0x813412d2e9480a56e2f05f71395331336e1860720e12e1c4eb32f8206d44ef74`](https://explorer-studio-dev.genlayer.com/transactions/0x813412d2e9480a56e2f05f71395331336e1860720e12e1c4eb32f8206d44ef74) (Status: `DENY`, `MAJORITY_AGREE`)

### Note on Unverified Flows
Flows for publication caps, policy-change invalidation, and agent-revocation invalidation are fully tested within the automated direct-mode Pytest suite (`tests/direct/test_scopegate.py`) but have not yet been manually executed on the Studio-dev testnet explorer.

*Please see the test logs or run `python -m pytest tests/direct -v` for automated invariant proof.*

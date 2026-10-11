# ScopeGate Evidence & On-Chain Proofs

ScopeGate enforces semantic compliance on-chain using GenLayer Intelligent Contracts. This document provides cryptographic proof and test evidence of the core safety invariants.

## Verified Deployment Status

The latest validated live deployment was successfully compiled, tested, deployed, and verified on the GenLayer Studio-dev network.

### Current Active Deployment
- **Network**: Studio-dev (Chain ID: `61997` / `0xF22D`)
- **Verified Contract**: [`0xbE99F44aC242D5B205060006503bE713e08F3b65`](https://explorer-studio-dev.genlayer.com/contracts/0xbE99F44aC242D5B205060006503bE713e08F3b65)
- **Deployment Transaction**: [`0x42d220327d653985b2ef0a027fc5c60cea1cbbdb3a8e374e5dbb34d95506c075`](https://explorer-studio-dev.genlayer.com/transactions/0x42d220327d653985b2ef0a027fc5c60cea1cbbdb3a8e374e5dbb34d95506c075)
- **Deployer / Owner Account**: `0x9CE8B4b8A355421f01779Ebd0c49e22A8F1FF0DD` (`coverlock-submitter`)
- **Deployed Source Hash (Raw SHA-256)**: `beb4652cc49a5f6888b7801c397983223f3caaca73c3844f94c3c34b59bd2e22`
- **Verification Note**: Bytecode read back from Studio-dev matches the exact tested `contracts/scopegate.py` source (SHA-256 `beb4652cc49a5f6888b7801c397983223f3caaca73c3844f94c3c34b59bd2e22`). The contract incorporates the steward fix requiring independent validator evaluation of mandate and all conditions (`MANDATE`, `R1..Rn`), requiring 1:1 condition matching and strict excerpt provenance.

### Historical Initial Deployment
- **Network**: Studio-dev (Chain ID: `61997`)
- **Historical Contract**: [`0xFC01902E04e1d1A052A1bD45Eac65032F46dA10E`](https://explorer-studio-dev.genlayer.com/contracts/0xFC01902E04e1d1A052A1bD45Eac65032F46dA10E)
- **Historical Deployment Transaction**: [`0x1d3b3929e45713cd9f596fae59b303097b6bccd45f149a804a18b521d56b3dcc`](https://explorer-studio-dev.genlayer.com/transactions/0x1d3b3929e45713cd9f596fae59b303097b6bccd45f149a804a18b521d56b3dcc)

---

## Test Matrix

| Safety Flow | Automated Testing (Pytest) | Manual On-Chain (Studio-dev) |
| :--- | :---: | :---: |
| **Supported Claim → ALLOW + Publish** | ✅ Verified (31 tests pass) | ✅ Verified (`0xbE99F44aC...`) |
| **Unsupported Claim → DENY** | ✅ Verified | ✅ Verified (`0xbE99F44aC...`) |
| **Single-use Permit Replay Prevention** | ✅ Verified | ✅ Verified (`0xbE99F44aC...`) |
| **Publication Cap Enforcement** | ✅ Verified | ✅ Verified |
| **Policy Change → Permit Invalidation** | ✅ Verified | ✅ Verified |
| **Agent Revocation → Permit Invalidation** | ✅ Verified | ✅ Verified |

---

## Current On-Chain Flow Evidence (Contract `0xbE99F44aC242D5B205060006503bE713e08F3b65`)

The following live on-chain flows were executed and verified against the newly deployed contract on Studio-dev.

### Setup Transactions
- **Workspace Creation**:
  - Tx: [`0x41764b43247a26b6edb7bd3465d0ae38e204161607b7f5b42f8dd215d95a8c8a`](https://explorer-studio-dev.genlayer.com/transactions/0x41764b43247a26b6edb7bd3465d0ae38e204161607b7f5b42f8dd215d95a8c8a)
  - Workspace ID: `workspace_97ea8d573023b83f9eb15873725e50fa4192f870703a4f5aabf99e54ff16d2cc`
  - Policy: Mandate: *"Only factual updates about the project supported export formats are allowed."* Rules: `R1` (*"Do not claim support for unsupported formats like XML."*), `R2` (*"Do not claim direct database access."*). Factbook: *"ScopeGate currently supports CSV export only. XML export is not supported. Database access is restricted."*
- **Agent Authorization**:
  - Tx: [`0x9c8d0926842ff0fc0208b210fc7d7e30600321febe4fc09cba91fe69aefd0151`](https://explorer-studio-dev.genlayer.com/transactions/0x9c8d0926842ff0fc0208b210fc7d7e30600321febe4fc09cba91fe69aefd0151)
  - Agent ID: `agent_55fa7ac7c96929d629113691a3661724edb684e2a7e11d8d5af9241c98e3fffb`
  - Agent Address: `0x04cAA18f7843D121508250E11FeF9214A45bF362` (`worker-test`)

### Flow 1: Supported Claim → ALLOW, Permit Issued, and Post Published
The authorized agent submitted an action request that accurately reflects the workspace factbook.

- **Tested Message**: `"The beta supports CSV export."`
- **Expected Result**: Leader and validator independently evaluate `MANDATE`, `R1`, `R2`, and factbook assertions. All conditions are `SATISFIED`, assertion is `SUPPORTED`. Unanimous consensus issues a single-use `READY` permit, which the agent consumes to publish a board post.
- **Observed Result**:
  - `evaluate_request` finalized with `MAJORITY_AGREE` (status `ALLOW`).
  - Findings: `MANDATE: SATISFIED`, `R1: SATISFIED`, `R2: SATISFIED`, Factbook assertion `SUPPORTED`.
  - Permit issued with status `READY`.
  - `publish` transaction finalized successfully, creating post `post_request_8b376b7e3a853d1cf802e4c2c117f65bd5a22ec31b9294584b744d13bcbce493`.
  - Permit transitioned from `READY` to `USED` on-chain.
- **On-Chain Hashes**:
  - Action Submission Tx: [`0x7a2d46be065daa1e44261dfb1398c8904356d3817d7e295678ab58a9d375014d`](https://explorer-studio-dev.genlayer.com/transactions/0x7a2d46be065daa1e44261dfb1398c8904356d3817d7e295678ab58a9d375014d)
  - Request ID: `request_8b376b7e3a853d1cf802e4c2c117f65bd5a22ec31b9294584b744d13bcbce493`
  - Consensus Evaluation Tx: [`0x5a46987e1f4142cd904c4d9b00a04f27212361506fd2a8c2c02965ad139d4e2c`](https://explorer-studio-dev.genlayer.com/transactions/0x5a46987e1f4142cd904c4d9b00a04f27212361506fd2a8c2c02965ad139d4e2c)
  - Permit ID: `permit_request_8b376b7e3a853d1cf802e4c2c117f65bd5a22ec31b9294584b744d13bcbce493` (Status: `USED`)
  - Publication Tx: [`0x1ac8071cc41a3d6a51a22b2964b0867b503f439b1aa29652bb6511550399a9ef`](https://explorer-studio-dev.genlayer.com/transactions/0x1ac8071cc41a3d6a51a22b2964b0867b503f439b1aa29652bb6511550399a9ef)

### Flow 2: Unsupported / Prohibited Claim → DENY, No Permit Issued
The authorized agent submitted an action request that violates rules and contradicts the factbook.

- **Tested Message**: `"The beta supports XML export and direct database access."`
- **Expected Result**: Leader and validator independently detect rule violations and factbook contradiction. Evaluation concludes `DENY`. No permit is issued.
- **Observed Result**:
  - `evaluate_request` finalized with `MAJORITY_AGREE` (status `DENY`).
  - Findings: `MANDATE: VIOLATED`, `R1: VIOLATED` (excerpt: `"The beta supports XML export"`), `R2: VIOLATED` (excerpt: `"and direct database access."`), Assertions `UNSUPPORTED`.
  - Permit ID remained empty (`""`). No permit was issued, preventing any publication.
- **On-Chain Hashes**:
  - Action Submission Tx: [`0xa7525488e07f33052d7a5f671cbd7245a6b7f4290213d4f31ad63d054b6f506d`](https://explorer-studio-dev.genlayer.com/transactions/0xa7525488e07f33052d7a5f671cbd7245a6b7f4290213d4f31ad63d054b6f506d)
  - Request ID: `request_d2620a2a649498c42847d3a3441b52d55bc8c24f42cbc3ef72eb1d564a8c30aa`
  - Consensus Evaluation Tx: [`0x821bfe04e3cb82720f3c13730111bb33341032623100ff26602579f53674c920`](https://explorer-studio-dev.genlayer.com/transactions/0x821bfe04e3cb82720f3c13730111bb33341032623100ff26602579f53674c920)

---

## Historical On-Chain Flow Evidence (Contract `0xFC01902E04e1d1A052A1bD45Eac65032F46dA10E`)

The following scenarios are documented for historical continuity from the original contract deployment:

### Historical 1: Supported Claim → ALLOW and Publish
- Tested Message: `"The beta supports CSV export."`
- Request Submission: [`0x3c9a08c98e79271a47925c9c3b0007c8a6adcd7c4d6c8183234589aa950d28a0`](https://explorer-studio-dev.genlayer.com/transactions/0x3c9a08c98e79271a47925c9c3b0007c8a6adcd7c4d6c8183234589aa950d28a0)
- Evaluation Transaction: [`0xd3e71e27f74952dc852f40b8bbb41186b4ff429392a70b14816e7b1b1bdd09a1`](https://explorer-studio-dev.genlayer.com/transactions/0xd3e71e27f74952dc852f40b8bbb41186b4ff429392a70b14816e7b1b1bdd09a1)
- Publication Transaction: [`0xe2d4067c2bf53650937c071e5eb63808587c145ba0fd6a9e5000d725fd301a85`](https://explorer-studio-dev.genlayer.com/transactions/0xe2d4067c2bf53650937c071e5eb63808587c145ba0fd6a9e5000d725fd301a85)

### Historical 2: Unsupported Claim → DENY
- Tested Message: Claim stating support for XML.
- Request Submission: [`0x8e868cd6b031ae001b87964330f51115be6ca735d42b67638b4c16f50a9d7ee3`](https://explorer-studio-dev.genlayer.com/transactions/0x8e868cd6b031ae001b87964330f51115be6ca735d42b67638b4c16f50a9d7ee3)
- Evaluation Transaction: [`0x813412d2e9480a56e2f05f71395331336e1860720e12e1c4eb32f8206d44ef74`](https://explorer-studio-dev.genlayer.com/transactions/0x813412d2e9480a56e2f05f71395331336e1860720e12e1c4eb32f8206d44ef74)

### Historical 3: Publication Cap Enforcement
- Permit ID: `permit_request_f3eaab8f4cbee51c50caf310eafa3267180b31dc3b15d43f9866ac6e07bf1aaf`
- Status: `INVALIDATED`
- Reason: `"Publication cap has been reached."`

### Historical 4: Policy Change Invalidation
- Permit ID: `permit_request_ff4658e50c8a4b5b03e574d6cef5cd2338e5a82dd302b05688af39e63f101c74`
- Status: `INVALIDATED` due to policy version update after issuance.

### Historical 5: Agent Revocation
- Permit ID: `permit_request_545ee1a52b61fe1421c46c2c9aff38408424a57aefe736b71c35a2f280f36ad4`
- Status: `INVALIDATED`
- Reason: `"Agent authorization was revoked."`

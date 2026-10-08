# ScopeGate Backend Handoff

## Implemented

- Added one Intelligent Contract at `contracts/scopegate.py`.
- Added direct-mode tests under `tests/direct/`.
- Added a Windows compatibility patch for GenLayer direct mode in `tests/conftest.py`.
- Added live frontend adapter at `web/src/liveAdapter.ts`.
- Added demo/live mode switching in the existing React app.
- Pinned `genlayer-js@2.0.0-rc.1`.
- Pinned `genlayer-test==0.19.2`, `genvm-linter==0.11.0`, and `pytest==8.3.4`.
- Added `gltest.config.yaml`, `requirements.txt`, and `fee-profile.json`.
- Added browser-wallet deployment page at `web/deploy.html`.

## Contract Surface

Writes:

- `create_workspace`
- `save_policy_draft`
- `activate_draft`
- `authorize_agent`
- `revoke_agent`
- `submit_action`
- `evaluate_request`
- `publish`

Views:

- `list_workspaces`, `get_workspace`
- `list_policies`, `get_policy`
- `list_agents`, `get_agent`
- `list_requests`, `get_request`
- `list_evaluations`, `get_evaluation`
- `list_permits`, `get_permit`
- `list_posts`, `get_post`

## Frontend Integration

Live mode uses `VITE_SCOPEGATE_CONTRACT_ADDRESS` and `studioDevnet` from `genlayer-js/chains`.

The live adapter:

- Reads paginated contract records.
- Requires a connected injected wallet for writes.
- Estimates fees with `estimateTransactionFeesForWrite`.
- Submits returned `distribution` and `feeValue` unchanged.
- Waits for finalization and checks `isSuccessful`.
- Does not fall back to local demo data on live RPC failure.
- Correlates live `submit_action` calls through `get_request_id_for(sender, client_nonce)`.
- Surfaces invalidated permits with contract-provided invalidation reasons.

## Checks Run

- `.\.venv\Scripts\python.exe -m pytest tests\direct -v`: 7 passed.
- `.\.venv\Scripts\genvm-lint.exe check contracts\scopegate.py --json`: passed; validator found contract `ScopeGate` with 23 methods.
- `cd web && npm.cmd run lint`: passed.
- `cd web && npm.cmd run build -- --outDir dist-codex`: passed. `web/dist` was locked by the local environment, so the verified production output is in `web/dist-codex`.
- `.\.venv\Scripts\python.exe -m pytest tests\integration -v`: 1 skipped because `SCOPEGATE_DEPLOYED_ADDRESS` is not set.

## Deployment

No real Studio-dev deployment was performed in this repair pass. Blockers:

- No deployment signer/private key/account environment variable was present.
- Browser-wallet confirmation is required for the prepared wallet deployment page.

## Remaining Work

- Start the Vite dev server and open `/deploy.html`.
- Connect a funded Studio-dev wallet.
- Select `contracts/scopegate.py` and deploy.
- Save real deployment address and transactions.
- Set `VITE_SCOPEGATE_CONTRACT_ADDRESS`.
- Run live owner/agent workflow and record receipts in `docs/EVIDENCE.md`.

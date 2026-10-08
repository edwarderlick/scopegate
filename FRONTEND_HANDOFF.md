# ScopeGate Frontend Handoff

## Run Commands

- Install: `cd web && npm.cmd install`
- Dev server: `cd web && npm.cmd run dev`
- Type check: `cd web && npm.cmd run lint`
- Production build: `cd web && npm.cmd run build`

## Implemented Routes

- `/`
- `/how`
- `/workspaces`
- `/workspaces/:id`
- `/workspaces/:id/policy`
- `/workspaces/:id/agents`
- `/actions`
- `/submit`
- `/actions/:id`
- `/board`
- fallback not-found page

## Demo Behavior

The app is frontend only. Demo data is stored in `localStorage` with schema version `scopegate-demo-state-v1` and can be reset from the persistent app header. Example records and simulated outcomes are labeled. Custom edited messages stay `PENDING` and receive no permit.

The shared TypeScript state, adapter interface, and demo adapter live in:

- `web/src/domain.ts`
- `web/src/demoAdapter.ts`
- `web/src/store.tsx`

## Backend Integration Points

Replace `DemoAdapter` with a backend-backed adapter implementing `DataAdapter`. Keep policy, agent, request, evaluation, permit, and board mutations behind that interface. Wallet connection is intentionally separate from demo identities and does not request signatures or transactions.

## Checks Run

- `npm.cmd run lint` passed.
- `npm.cmd run build` passed.

## Remaining Limitations

- No backend, contracts, RPC reads, GenLayer SDK, transaction signing, API routes, AI inference, or deployment are implemented.
- Evaluation fixtures are authored local examples only.
- Wallet support is injected-wallet discovery and network switching UI only.

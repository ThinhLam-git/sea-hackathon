# Agents API fixes and application/agent refactor

Reviewed checkout: branch `kha-dev`, commit `5703d93e894dbab76760d913f2af95e1a6e6e8c2`.

## Correctness fixes

### Semantic conflicts and retry policy

The policy layer now receives the complete typed buyer interpretation (`YES`, `NO`, `CONDITIONAL`, `UNKNOWN`, `CONFLICTING`). A decision-relevant unresolved conflict about location, receiving arrangement, intent, timing, or required COD readiness cannot permit `STANDARD_REATTEMPT`; policy escalates with an explicit conflict reason. Negative and conditional states do not count as a positive confirmation. An irrelevant `UNKNOWN` does not automatically block a fully supported non-COD retry. The model still assesses meaning; policy applies constraints to the returned states without regex, keywords, or case-specific mappings.

Regression coverage is in `tests/policy-gate.test.ts`: the reviewed combination (intent YES, availability YES, address change CONFLICTING, no missing info, candidate retry) returns `ESCALATE_REVIEW` and `SEMANTIC_CONFLICT`. The suite also covers negation, conditional availability, conditional COD readiness, timing, supported clear arrangements, and irrelevant unknown facts.

### Clarification must be saved

An initial `CLARIFY` without a valid persisted question is now an explicit `ESCALATE_REVIEW` result with `CLARIFICATION_NOT_SAVED`; it cannot appear as a normal successful clarification. The managed agent gets at most one same-session, clarification-only continuation when it omits the question. That continuation cannot call Decisions or create another assessment. If it still does not save a question, the workflow keeps the explicit review result.

`tests/clarification.test.ts` covers missing and valid saved questions. `tests/agents-lifecycle.test.ts` covers a saved question followed by a matching reply and the final slot selection. Manual `USER_NO_REPLY` remains separate: after a real pending question it copies slot 1 exactly, performs no agent/Decisions call, and adds only the final-selection audit event.

### Interrupted-run inspection and reconciliation

The authenticated backend endpoint is `POST /api/runs/{id}/recovery`. It owner-filters the D1 record, then retrieves the recorded remote session, recent turns/items and pending required actions using the OpenAI SDK. It compares the persisted attempt ledger and snapshot hash with the current snapshot.

Recovery re-delivers only a completed, stored tool result that matches a currently pending remote call. It uses a deterministic idempotency key and records accepted/ambiguous delivery state. It never repeats an unrecorded or uncertain Decisions request, creates a replacement session, or reopens a completed business case. A complete validated stored chain can be finalized without new inference. In-progress, failed, changed-snapshot, missing-result, ambiguous-delivery, and inspection-failure paths return a clear status and next action for Ops.

Recovery regression coverage is in `tests/agents-recovery.test.ts`. It mocks the remote session APIs; no live interrupted-session recovery was attempted. There is no recovery UI.

### Cancellation and Decisions request ledger

The request signal is combined with the configured assessment deadline and passed through agent business tools and each Decisions call, with a 15-second per-request timeout. Automatic SDK retries are disabled. Work checks the shared signal before dispatch; late output cannot commit a stale initial or after-reply assessment.

The local stream is not treated as proof of remote cancellation. When the session and turn are known, the adapter sends the Agents API `agent.session.input.cancel` event and records `ACCEPTED`, `AMBIGUOUS`, or `UNAVAILABLE`. OpenAI's Node SDK documents the cancel input as cancelling the active session turn and models `cancelled` as a terminal turn state; the application still treats an accepted cancel request as distinct from observing that terminal state. [OpenAI Node SDK Agents API types](https://github.com/openai/openai-node/blob/main/src/resources/beta/agents/agents.ts), [turn status types](https://github.com/openai/openai-node/blob/main/src/resources/beta/agents/sessions/turns/turns.ts).

Each Decisions dispatch is checkpointed before dispatch and updated with purpose, workflow execution and input snapshot, requested/returned model, provider request ID when available, latency, SDK usage or explicit unavailability, a safe provider-response summary, and success/refusal/error/timeout/ambiguous status. Failed attempts count. Provider error bodies and keys are excluded. `tests/agents-request-accounting.test.ts` covers pre-dispatch recording, failed-attempt counting, sanitized errors, timeout bounds, usage, and no new dispatch after cancellation. `tests/agents-cancellation.test.ts` covers the remote-cancel event and stale-commit rejection using mocks.

## Final layout and dependency direction

```text
apps/web/
  app/                 pages, styles, auth integration, API routes
  components/          UI components
  hooks/               UI hooks
  public/              static assets
  worker/index.ts      single Cloudflare Worker entry point
  db/                  Drizzle schema
  lib/application/     use-case services and server-only v2.2 data/view adapters
  lib/infrastructure/  D1, owner isolation, secret resolution, recovery adapter

packages/agent/src/
  runtime/             managed session, stream events, recovery
  decisions/           hypothesis/action/support and request accounting
  semantics/           typed model-assessed buyer facts and validation
  workflow/            pipeline and two-assessment simulator
  policy/              profile and deterministic constraints
  skills/              pipeline skills and hosted-skill loader/assets
  ports/               storage/runtime interfaces
  models.ts            agent-only lifecycle types

packages/contracts/src/ browser-safe public DTOs and schemas
fixtures/               v2.2 and legacy inputs; evaluator labels stay server-side
tests/                  retained and new regression coverage
reports/                this handover
```

Dependency direction is `web/application → agent + contracts`, `agent → contracts`, and `contracts → Zod only`. The agent package has no UI, route, Worker binding, browser-state, or environment-secret imports. D1 and authentication stay in `apps/web`; the application constructs the provider client and passes it through typed ports.

Material framework deviation: Vite/Vinext/Cloudflare configuration remains at repository root because that is the existing single-Worker build entry. `vite.config.ts` points Vinext at `apps/web`, moves the Worker main to `apps/web/worker/index.ts`, and adds source aliases. Root npm install/build remain in place; this is not a package-manager workspace migration or a separate service.

### Entry points and configuration

- Pages and API routes moved from root `app/` into `apps/web/app/`; components, hooks, static assets, DB schema, helper libraries and Worker entry moved under `apps/web/`.
- Active v2.2 runtime, policy, lifecycle, Decisions and both skill sets moved from `lib/order-rescue-v2/` into `packages/agent/src/`. The legacy v0.5 runtime and its original fixtures remain under `lib/order-rescue/` and `fixtures/`.
- `packages/contracts/src/index.ts` owns public schemas and DTOs. Existing public route paths and top-level run DTO keys remain. Evaluator labels and future reply text are intentionally absent from public values (`golden: []`, `expected: null`, no future reply event text); sample availability is an additive boolean. The UI's **Use sample response** flow remains server-side through `use_sample`, without returning the canned response text to the browser.
- `apps/web/db/schema.ts` is now the Drizzle schema source in `drizzle.config.ts`; the D1 binding remains `DB`, `.openai/hosting.json` is unchanged, and the existing migration is reused. No D1 schema migration was added.
- The four real hosted-skill files are `packages/agent/src/skills/hosted/*/SKILL.md`. The loader imports them as Vite raw assets. No external hosted-skill ID/configuration or additional deployment was added.
- Root `tsconfig.json` and `vite.config.ts` map `@web`, `@agent`, and `@contracts`. `packages/agent/package.json` and `packages/contracts/package.json` describe source packages; npm installation remains at the root.

## Install, build, start, and test

From `Prototype-OpenAI/` with Node.js 22.13+:

```bash
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_clear_warstar.sql
npm start
```

For Vite development use `npm run dev`. Local development can read the root `.env`; when starting the built Worker directly, Wrangler reads local secrets from a `.dev.vars` or `.env` alongside `dist/server/wrangler.json`. Do not commit either file. [Cloudflare local environment-variable guidance](https://developers.cloudflare.com/workers/configuration/environment-variables/).

Verification commands:

```bash
npm test
npm run typecheck
npx tsc -p packages/contracts/tsconfig.json --noEmit
npx tsc -p packages/agent/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
npm run build
npm run demo
npm run demo:legacy
```

## Verification evidence

### Baseline before edits

- `npm test`: 130 tests passed across 14 files.
- `npm run typecheck`: passed.
- `npm run build`: passed; Vinext emitted its existing API-route `? Unknown` analysis warning.
- `npm run demo`: 30/30 synthetic v2.2 cases.
- `npm run demo:legacy`: 25/25 v0.5 cases.
- No dedicated UI smoke command was present.

### Final checks after the folder move

- `npm test`: 151 tests passed across 19 files.
- Root and all three package TypeScript checks passed.
- `npm run build`: passed.
- `npm run demo`: 30/30 supplied draft v2.2 scenarios.
- `npm run demo:legacy`: 25/25 v0.5 rollback scenarios.
- Hosted-skill checks load all four Markdown sources and verify their descriptions/instructions. A built-server scan found all four skill identifiers in the server bundle.
- `git diff --check` passed. `.openai/hosting.json` stayed unchanged. Temporary local secrets and the separate live-rehearsal D1 store were removed. Wrangler's ignored `.wrangler/state/` cache and local D1 state from the Worker smoke remain as local development artifacts; they are not tracked or included in the change.

### Mocked tests and Replay

The unit suite mocks Agents API and Decisions calls; it covers semantic conflicts and conditionals, saved clarification, same-session reply lifecycle, no-reply zero-call behavior, recovery reconciliation, cancellation, request accounting, DTO redaction, owner isolation, duplicate/conflicting submissions, and stale persistence/restore behavior. Replay commands are deterministic synthetic regression checks and are not evidence of model accuracy.

### Real Worker/D1 handler smoke

The built Worker ran locally against a fresh Wrangler-local D1 store initialized from the existing migration. With test owner headers representing the authenticated hosting layer, `/`, `/api/status`, and `/api/cases` returned 200, the cases endpoint returned 30 cases, and a Replay clarification run was created and finalized by no-reply. D1 restore returned the completed run with selected slot 1 and final action `CLARIFY`; a query counted zero Decisions attempts. Repeating the identical no-reply event returned 200, a conflicting second event returned 409, and a different owner received 404. The resulting ignored D1 state remains under `.wrangler/state/` for local development and is not tracked.

The built UI rendered its order-recovery page and the existing ChatGPT sign-in gate; CSS, page chunks and favicon loaded. The local browser had no authenticated ChatGPT context, so the authenticated workflow was verified through the API smoke instead. There is no dedicated UI test suite. No layout or stylesheet redesign was made.

### Live provider rehearsal

An API key was available in the local environment. A temporary config-local secret binding was created only for the bounded rehearsal and removed afterward. One synthetic `DEMO-005` Live AI run created one Agents API session. The initial assessment made 3 Decisions attempts, all succeeded, and persisted one `CONFIRM_INTENT` question. A synthetic direct buyer reply continued the same remote session and made 3 more Decisions attempts, all succeeded. The after-reply assessment was accepted, selected slot 2 and persisted in D1; a subsequent authenticated GET restored it as `COMPLETED`. Final policy action was `ESCALATE_REVIEW`, so the system produced a valid final Ops-review recommendation, not an automatic retry.

The separate no-reply D1 smoke selected slot 1 exactly and made zero Decisions requests. Total live Decisions requests: **6** (3 initial + 3 after reply), across **1** Agents API business session. No live no-reply inference was run. No auth/quota error occurred. This live run preceded the final internal folder regrouping; after that move, the full automated suite, build, Replay checks, hosted-skill bundle check and Worker/D1 handler smoke were rerun. No provider cancellation or interrupted-run reconciliation was exercised live; those behaviors have mocked regression coverage and SDK-contract inspection only.

## Remaining limits

- No deployment, publication, push or merge was performed.
- Recovery is backend-only and deliberately leaves incomplete or ambiguous provider outcomes for Ops; it does not retry them.
- Remote cancellation acceptance is recorded but the app does not claim the remote turn has reached terminal `cancelled` until that status is observed.
- The public DTO keeps compatibility keys while redacting evaluator labels and future reply values. The sample-response button remains, but its prepared text is no longer displayed in the browser.
- Live outcomes can differ from the draft Replay labels. The one successful live rehearsal ended in Ops review; it is not evidence of calibrated delivery-success probability or broad model accuracy.

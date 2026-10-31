# Agents API migration handover

Date: October 31, 2026

Active contract: Order Rescue v2.2, 30 synthetic cases

Status: Agents API is the default live runtime. The legacy Responses runtime remains an explicit rollback. No UI, publishing, deployment, or push changes were made.

## Architecture

`app/api/runs` authenticates the owner and stores the initial run in D1 before starting remote inference. The backend keeps the deterministic pipeline `load-case → prepare-input → assess-case → validate-output → policy-gate → compose-recommendation → audit-log`. Inside `assess-case`, one managed Agents API session uses an OpenAI-hosted environment and four inline skills:

- `investigate-case`
- `assess-decisions`
- `clarify-buyer`
- `recommend-recovery`

The agent has five strict backend function tools: `get_case_snapshot`, `evaluate_hypothesis`, `evaluate_action`, `submit_assessment`, and initial-only `request_clarification`. Function handlers bind to the authenticated run; they do not accept owner, model, policy version, or question budget from the agent. There is no MCP or D1 credential in the hosted environment.

The exact order is enforced in code: current snapshot → validated evidence and hypothesis result → typed buyer interpretation and action result → six-field commit. The commit uses stored Decisions selections and refuses repeated or foreign IDs. Code sets evidence verification from the source registry, validates buyer quotations against direct buyer sources, checks hashes and missing information, and preserves candidate action even if policy changes the final action. Unaccepted or invalid output goes to Ops; it never falls back to Responses or Replay.

The current buyer reply is added to the run and checkpointed under a D1 reservation before a continuation on the same session. Manual no-reply selects the original initial slots and appends a final-selection audit record without continuing the session or calling Decisions. The UI/API assessment fields remain compatible; status adds separate runtime metadata.

## Decisions and confidence

`evaluate_hypothesis` makes a `gpt-6-luna` seven-cause choice request, then a separate evidence-support score request using rubric `evidence-support-v2.2`. `evaluate_action` makes a five-action choice request after the hypothesis and buyer facts are recorded. A complete assessment uses three Decisions requests. All choices retain the complete probabilities and API confidence separately.

BI `LOW/MEDIUM/HIGH` comes from the evidence-support score, never a selected-action probability or delivery-success probability. Validation caps unknown cause at LOW and preserves raw score, adjusted score, and cap reason. Buyer meaning is represented as YES/NO/CONDITIONAL/UNKNOWN/CONFLICTING with exact source quotations. Live meaning is agent-derived; code validates provenance and applies policy. `replay-semantics.json` contains separate controls only for exact synthetic Replay responses.

## Runtime and setup

Verified package versions: `openai` 7.46.0 and `@openai/agents` 0.21.0. The active session calls use the official `client.beta.agents.sessions` interface; the legacy package path remains available under the runtime selector. The tested Agent model is `gpt-6-sol`; Decisions uses `gpt-6-luna`.

Use Node.js 22.13+ and install dependencies with `npm ci` (or the repository's `npm run install:ci`). Set the following in local `.env`; hosted Workers use runtime secrets/configuration:

```dotenv
OPENAI_API_KEY=...
ORDER_RESCUE_MODEL=gpt-6-sol
ORDER_RESCUE_RUNTIME=AGENTS_API
ORDER_RESCUE_AGENT_TIMEOUT_MS=110000
ORDER_RESCUE_MAX_TOOL_CALLS=7
```

The runtime bounds timeout to 10–120 seconds and tool calls to 5–12. Each assessment is one session turn; API token usage and a provider-side token budget are not exposed by the installed endpoint. Do not treat unavailable usage as zero. The session adapter packages each local `SKILL.md` as an inline ZIP at `<skill-name>/SKILL.md` and supplies it in an `openai_hosted` environment. No separate personal skill installation is needed.

For local D1, run `npm run build`, execute `drizzle/0000_clear_warstar.sql` with the local Wrangler D1 command in README, then `npm run start`. `npm run dev` is also available. To explicitly roll back Live AI, set `ORDER_RESCUE_RUNTIME=LEGACY_RESPONSES`; Agents API errors do not switch paths automatically. `REPLAY` remains separate and does not fabricate session IDs or API probabilities.

## Persistence and recovery

The existing D1 `rescue_runs` JSON stores session/environment/turn IDs, status, and the completed tool-result ledger. Each ledger entry records the result, internal tool ID, available external call ID, phase, linked Decisions IDs, timestamps, latency, and action input hash. The completed decision record stores snapshot/evidence hashes and full Decisions metadata in `model_info`. Existing `rescue_decisions` remain append-only. No schema migration or old-record rewrite was added.

`CREATING` is stored before session creation; session, turn and completed tool outputs are checkpointed before the next external step. Reply/no-reply are serialized with a 180-second reservation and revision/write-token checks. A run left in `CREATING` or `ACTIVE` after the reservation expires is rejected for mutation and requires explicit inspection; the server does not recreate the session or rebill Decisions automatically. Completed tool outputs are retained for investigation, but automatic retrieval/re-delivery of pending function results is not implemented. A crash between an external billable call and its completed-result checkpoint can therefore have an ambiguous billing outcome.

## Validation

- `npm test`: 130 tests passed, including managed-session mocks, skill packaging, Decisions distributions, semantic provenance, policy gates, lifecycle continuation, and exact no-reply selection.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run demo`: all 30 supplied DRAFT v2.2 scenarios matched.
- `npm run demo:legacy`: all 25 v0.5 rollback scenarios matched.
- Local production Worker + isolated D1 smoke: `AGENTS_API` status, 30-case listing, persisted Replay reply, persisted exact no-reply selection, duplicate reply idempotency, conflicting reply rejection, and different-owner 404 passed.

### Live API evidence and boundary

The bounded real API probe used synthetic data only. The first valid session attempt used a skill format that the environment diagnostics showed as unloaded, so it is not counted as skill-loading proof. A later inline-ZIP session verified the hosted skill, called the snapshot function, called the backend Decisions hypothesis function, received its result, and continued the same agent turn. The environment diagnostics listed `investigate-case` as loaded. No real business record or live carrier data was used.

- Successful session: `sess_04296b7244f65939006ae59161a7108196a7b29a4c6838732f`
- Hosted environment: `ccarenv_b64_Y2NhcmVudl82YWU1OTE2MWQ4Zjg4MTkxOTFiZTgwMWM3YmJkOTRhYw`
- Turn: `turn_04296b7244f65939006ae591692db48196886b0589f1124e61`
- Tool calls: `get_case_snapshot` (`exec_b93cfd0fabb1c818af492d3e68f0ad25cf8924e533481a0cb7`) and `evaluate_hypothesis` (`exec_a86ecff9328f59fb28f6120699c93308c1f34c81b819bb5311`)
- Decisions result ID: `835907df-f3c8-40d2-96ca-da036c852968`; request ID: `req_a71d32c198cb4e7c867ecc1a79a47323`
- Live experiment total: two created sessions and two Decisions requests. One additional session-create request was rejected with HTTP 400 because the endpoint rejected `spend_control`; no session was created by that request. No further live calls were made after reaching the two-session cap.
- The SDK returned `usage: null`; agent token usage and internal model-request count are unknown.

This live probe proves hosted skill loading, a real Decisions tool call, correlated function-result delivery, and same-turn agent continuation. The full production assessment chain (three Decisions calls per assessment), D1 checkpoints during a live Agent run, and same-session live buyer-reply continuation were verified with mocked SDK/session tests, not exercised against the provider. The local D1 smoke exercised Replay and event/persistence behavior. This is the main remaining live validation limitation.

## Code map

- `lib/order-rescue-v2/agents/session.ts`: SDK stream adapter, inline ZIP skills, tool-result dispatch and event metadata.
- `lib/order-rescue-v2/agents/runtime.ts`: ordered tool chain, source validation, commit checks, clarification gate.
- `lib/order-rescue-v2/agents/decisions.ts`, `business-facts.ts`: Decisions contracts and typed semantic facts.
- `lib/order-rescue-v2/agents/skills/`: app-local hosted skill sources.
- `lib/order-rescue-v2/simulator.ts`, `repository.ts`, `app/api/`: two-assessment lifecycle, D1 checkpointing, auth, event reservation, persistence.
- `scripts/agents-api-spike.ts`: explicit `npm run spike:agents-api -- --run-live` synthetic probe; does not run as part of normal tests.

The migration plan remains at `docs/OrderRescue_Agents_API_Migration_Plan.md`. No deployment, publication, push, or frontend changes were performed.

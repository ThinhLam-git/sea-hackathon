# Order Rescue: active v2.2 MVP

The user explicitly selected the downloaded 30-case v2.2 contract on October 31, 2026. The active runtime is `lib/order-rescue-v2/`; `lib/order-rescue/` and the original 25-case fixtures are retained unchanged as the v0.5 rollback/regression path. Do not mix those contracts.

## Product boundary

This app recommends; delivery-operations staff decides. Synthetic data, demo policy, simulated outcomes. Never dispatch, send buyer messages, alter an address or COD, return, refund, cancel or penalize. Copying a question/recommendation is the only handoff. No roles, team administration or production-carrier integration.

## Contract and data

- `fixtures/v2/seed.json`: the supplied nine-table logical seed. Mutable assessment/result slots begin null. Server projection joins only raw input rows into seven fields: `case_id`, `failed_event`, `attempts_used`, `return_state`, `deadline`, `buyer_history`, `operational_context`.
- `prepare-input` supplies that projection, current raw sources and only released runtime interactions. T0 buyer context is allowed; unreleased replies, expected answers and future controls are forbidden in AI input.
- The model returns exactly six fields: `evidence`, `hypothesis`, `confidence`, `missing_info`, `question_key`, `candidate_action`. Evidence has `source_ref`, `fact`, `verification`; no invented call logs. The v2 vocabularies are defined in `models.ts`.
- `fixtures/v2/test-cases.json` is evaluator-only; its labels remain `DRAFT_NEEDS_USER_REVIEW`. Replay assessments and demo reply controls are generated separately by `scripts/import-v2.mjs`. Never force arbitrary live replies to match scripted labels.
- Policy version `demo-two-assessment-v2` governs the demo. The reference policy workbook contains broader proposals and public references, not verified live-carrier parameters. Where the broad workbook differs, the user-selected v2.2 runtime contract governs this MVP.

## Fixed seven-stage assessment pipeline

`load-case → prepare-input → assess-case → validate-output → policy-gate → compose-recommendation → audit-log`

Each stage has `skills/<name>/SKILL.md` and `skill.ts`. `name` must match the folder. `policy-gate`, `compose-recommendation`, and `audit-log` run after a halt; AI preparation/assessment/validation are skipped when halted before AI. The model cannot choose or skip stages, and has no tools/handoffs.

LIVE_AI uses one tool-free hosted Agents API session/turn (native HTTPS, environment `none`, no subagents) followed by one Decisions score in the same assessment stage. REPLAY uses a hand-authored draft assessment and never fabricates an API score. Failures/refusals/invalid output go to Ops without fallback. Keys and provider errors never enter responses, state, traces or browser code. Keep managed session/agent/turn IDs in audit metadata. Retry observations only, never resubmit ambiguous creation/input; cancel unfinished work on timeout and record whether cancellation was confirmed.

## Two assessments, one immutable final

1. Run the initial assessment/policy and save initial slots. Emit at most one approved question when policy permits; initial HOLD may still ask for missing intent/availability.
2. A matching buyer reply runs one after-reply assessment and policy, then atomically selects slot 2 and completes the case.
3. Manual `USER_NO_REPLY` selects the initial slots exactly. No clock advance, fixed wait duration, second question, after-reply assessment or third inference. An initial CLARIFY retained as final remains unresolved for Ops; it is not authorization to ask again.
4. Final outcome is immutable. Bind events to the actual question id. Duplicate identical event ids are idempotent; conflicting submissions are rejected. A short D1 reservation serializes reply/no-reply before live inference; revision/write-token checks protect persistence.
5. Existing D1 run storage holds v2 slots and an append-only audit timeline; no heavy account or operational-database expansion is needed. No-reply appends a final-selection audit event, not an assessment. Previous records and legacy rows must not be deleted or rewritten.

## Policy and confidence

- Check lifecycle, deadline, attempts, input safety and source provenance in code. A buyer reply never overrides these checks.
- Courier notes remain unverified. Only direct buyer sources establish buyer facts. Verified Ops signals must match their scope; a buyer reply never clears a disruption.
- Retry requires a current direct reply, intent, receiving availability, relevant COD readiness, no missing required information and no blocker. Unsupported address/execution requests, refusal, conflict and insufficient information go to Ops.
- Confidence measures support for a hypothesis, independently of retry eligibility. T0 buyer statements and verified operational checks can support high cause confidence while current intent is missing.
- Decisions rubric `evidence-support-v2.2` scales weighted LOW/MEDIUM/HIGH (0–2) to 0–100. Demo bands: 0–24 LOW, 25–74 MEDIUM, 75–100 HIGH. Code caps rating and band together. Never describe it as calibrated delivery-success probability. API scorer certainty stays separate.
- Bump the prompt version and generated replay metadata together when the prompt changes. Keep existing audit records unchanged.

## Staff interface

The homepage uses Lucas’s layout in `features/judge-demo/`, adapted to this v2.2 backend. Keep UI rendering driven by actual policy state; do not import newer Lucas fixtures, backend rules or Site identity for a visual change. A pending buyer question can coexist with HOLD. No reply can preserve unresolved initial CLARIFY. Never hard-code every reply as readiness for retry.

The header switches Vietnamese/English locally and persists the choice. Language changes must preserve the current review, typed input and API-call count. Translate interface text, approved questions and policy explanations; retain original buyer/source content and unchanged audit exports. English policy explanations map actual rule IDs, with the original policy note available.

Trace is observation only. Record actual stage timings/statuses and sanitized service operations; distinguish app skills, model assessment and agent tool calls. Current agent tools are disabled. Do not expose private reasoning, credentials or provider errors, invent timings for historical rows, or animate unrecorded tool activity. Trace replay must never submit requests. Preserve old records; No reply records selection/audit without new AI operations.

## Verification and publication

`npm test`; `npm run typecheck`; `npm run demo` (30 draft scenarios); `npm run demo:legacy` (25-case rollback path); Sites build helper.

Keep `.openai/hosting.json` identity and public audience. Secrets stay in runtime env. Preserve auth and per-user ownership. Never commit env files, credentials, local databases, generated builds or node_modules. Downloaded original reference documents remain in the parent workspace; deploy only reviewed synthetic inputs and app code.

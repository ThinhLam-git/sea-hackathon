# OpenAI migration record

## Confirmed baseline

The original Python and VoltAgent prototypes use 25 synthetic v0.5 cases, hand-authored replay outputs, a fixed seven-stage pipeline, two code-owned policy gates, approved Vietnamese question/reason templates and qualitative confidence. They recommend only. The model has no tools.

## v0.5 transition (retained rollback)

The v0.5 implementation replaced VoltAgent workflow/agent objects and the AI SDK model adapter with OpenAI Agents SDK orchestration over the Responses API. It remains in `lib/order-rescue/` as the rollback path. Non-AI skills and fixtures are carried forward. Prompt `assess-v0.5.1` clarifies that relative dates use source timestamps and the virtual clock. Hand-authored replay metadata is versioned for this clarified prompt; replay outputs and golden answers are unchanged. These are still hand-authored seeds, not newly recorded live results.

The browser/API experience is rebuilt as a private ChatGPT Site. D1 replaces local JSONL persistence for the hosted server: a run's state and new decision rows are saved together, earlier rows are never updated, and stale concurrent writes are rejected. An export produces JSONL. Local CLI tests keep their history in memory.

Replay remains the default for a stable, no-cost demo. Live GPT is an explicit mode and never silently switches to replay after a failure. The agent receives only the current sanitized snapshot. API keys are server secrets; no credentials or runtime data belong in Git.

## Preservation evidence

- Original 25-case golden suite and safety cases run against the new pipeline.
- Additional migration tests cover tool-free structured output, input isolation, missing/incompatible replays, append-only in-memory history, halted-stage order and monotonic time.
- HTTP smoke checks cover buyer clarification → retry, duplicate events, timeout → Ops, verified flooding → hold and injection → stop before AI.
- The existing key has successfully completed a Responses request and an Agents SDK assessment. This demonstrates access, not general model accuracy.

## Limits and open questions

- Hand-authored replay seeds do not establish live-model accuracy.
- The source-reference validator proves refs and literal quotes exist; it does not fully prove semantic entailment.
- Carrier integrations, real messaging, dispatch, refunds, returns and address changes remain outside the prototype.
- Full live coverage, latency/cost evaluation and operational validation require a separate evaluation effort.

## Rollback

The earlier implementations and their datasets remain intact in the original workspace. GitHub's default branch is unchanged; this work is isolated on `phuc-dev`. Sites versions support returning to a previously saved version after subsequent updates. The initial deployment only adds new D1 tables; it migrates no existing customer records.

## v0.5 Decisions scoring addition (retained rollback)

The v0.5 LIVE_AI path makes its generative Responses call and a separate `gpt-6-luna` scoring call within the existing assess-case stage. The output contract keeps the six qualitative Agent fields and adds optional score metadata to the decision JSON; D1 stores it without a schema migration. Replay outputs remain unchanged.

The score is a demo evidence-support rubric rating with validation caps, not an outcome probability. No action thresholds or policy rules change. Tests cover request isolation, independent scorer certainty, malformed results, refusals/outages, invalidated citations, policy caps, replay/pre-AI call skipping, and immutable prior scores.

## Active v2.2 Agents API runtime (October 31, 2026)

The active `lib/order-rescue-v2/` runtime uses a durable OpenAI Agents API session in an OpenAI-hosted environment. Four app-local `SKILL.md` files are packaged as inline ZIP skills. Five strict backend function tools provide the current snapshot, hypothesis Decisions, action Decisions, assessment commit, and one permitted clarification. The backend validates source refs, quote provenance, stored decision IDs, schema, lifecycle, and policy. It checkpoints the run before remote work and saves session/turn/tool-result metadata and decision IDs to the existing D1 run record.

The model interprets buyer semantics; code only validates typed states and exact quote ownership. Decisions selection probabilities and API confidence stay separate from evidence-support score/band. `ORDER_RESCUE_RUNTIME=LEGACY_RESPONSES` explicitly selects the old v2 Responses path; there is no automatic fallback. Replay has separate exact-sample semantic controls and never applies them to live replies. A manual no-reply selection uses the original initial slots without continuing the session.

See [agents-api-migration.md](../reports/agents-api-migration.md) for the implementation map, environment setup, verification, real API evidence, live request counts, recovery limits, and rollback procedure.

## October 31, 2026: selected v2.2 data contract

The active app now uses the user-provided 30-case pair, strict six-field v2.2 assessment and manual no-reply final selection. See DATA-SOURCES.md and the active AGENTS.md. The prior v0.5 implementation above remains intact for rollback. D1 tables were reused; existing runs/audit records were not migrated destructively or deleted. Reply/no-reply outcomes use a short reservation plus revision checks. The UI adopts a top progress tracker, three work panels and functional colors: blue delivery record, amber buyer input, green recommendations and purple AI scoring.

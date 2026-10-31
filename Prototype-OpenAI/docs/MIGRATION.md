# OpenAI migration record

## Confirmed baseline

The original Python and VoltAgent prototypes use 25 synthetic v0.5 cases, hand-authored replay outputs, a fixed seven-stage pipeline, two code-owned policy gates, approved Vietnamese question/reason templates and qualitative confidence. They recommend only. The model has no tools.

## Implemented transition

The new default implementation replaces VoltAgent workflow/agent objects and the AI SDK model adapter with OpenAI Agents SDK orchestration and the Responses API. Non-AI skills and fixtures are carried forward. The model default remains `gpt-5.4-mini`. Prompt `assess-v0.5.1` clarifies that relative dates use source timestamps and the virtual clock. Hand-authored replay metadata is versioned for this clarified prompt; replay outputs and golden answers are unchanged. These are still hand-authored seeds, not newly recorded live results.

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

## Decisions scoring addition

The user requested confidence scoring through Decisions API. LIVE_AI now makes its generative Responses call and a separate `gpt-6-luna` scoring call within the existing assess-case stage. The output contract keeps the six qualitative Agent fields and adds optional score metadata to the decision JSON; D1 stores it without a schema migration. Replay outputs remain unchanged.

The score is a demo evidence-support rubric rating with validation caps, not an outcome probability. No action thresholds or policy rules change. Tests cover request isolation, independent scorer certainty, malformed results, refusals/outages, invalidated citations, policy caps, replay/pre-AI call skipping, and immutable prior scores.

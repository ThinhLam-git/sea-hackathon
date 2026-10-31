# Order Rescue · OpenAI MVP v2.2

A delivery-recovery workspace for operations staff. **30 synthetic cases, demo policy, simulated outcomes.** Staff approves every handling decision; no messages or logistics actions are executed.

[Public demo](https://order-rescue-gpt-phuc.lankybluff1.chatgpt.site) · Teammates can sign in with their own ChatGPT accounts. Runs stay separate; the server uses the owner's API key for Live GPT.

## Use the app

1. Choose a demo delivery. The top tracker shows progress.
2. The blue panel shows delivery facts; the amber panel holds the approved buyer question and response.
3. Choose **Use sample response → Review response** for a free Replay walkthrough, or type a custom response for Live GPT (API credits).
4. Choose **No reply** to finalize with the initial assessment without another API call. There is no fixed wait or timer.
5. Review the recommendation in the green decision desk. Purple identifies AI confidence; Evidence and History remain in this side panel. **Copy recommendation** prepares the handoff to staff.

Clock values belong to the synthetic scenario. An initial CLARIFY kept after No reply means unresolved information for Ops, not a second question. Demo scenarios/modes and technical fields stay collapsed.

## Stack and flow

- OpenAI Agents API managed sessions (`gpt-6-sol`) in an OpenAI-hosted environment with four loaded skills and five backend function tools.
- Decisions API cause and action distributions plus separate evidence-support scoring (`gpt-6-luna`) in each live assessment.
- React/Vinext/TypeScript on ChatGPT Sites / Cloudflare Workers; D1 stores sessions, two assessment slots, final selection and an append-only audit timeline.
- The backend retains its seven deterministic stages: `load-case → prepare-input → assess-case → validate-output → policy-gate → compose-recommendation → audit-log`. Inside `assess-case`, one durable agent session extracts evidence, invokes the Decisions-backed business tools in order, and submits the six-field proposal for backend validation.

At most **two assessments**: initial and after a matching buyer reply. Manual No reply selects initial exactly; there is no third assessment or second question. Concurrent outcomes are serialized before inference and saved with revision checks. Failures go to Ops without silent Replay fallback. Auth remains lightweight; no roles, teams or administration screens.

The nine logical tables from the supplied raw seed are joined into an explicit server-only input projection. Mutable review state uses the existing D1 tables, keeping the MVP small. Future replies, expected outputs and previous assessment/result slots are excluded from AI inputs. Buyer history stays empty where the seed provides none.

## Data and reference documents

The user-selected contract is `order-rescue-demo-30-v2.2`, policy `demo-two-assessment-v2`. See [source mapping](docs/DATA-SOURCES.md).

`fixtures/v2/seed.json` and `test-cases.json` preserve the downloaded originals. `replay.json`, `controls.json`, `replay-semantics.json` and `provenance.json` are generated separately. Replay semantics apply only to the exact scripted synthetic reply; live replies always go through the agent. The supplied expected labels are **DRAFT_NEEDS_USER_REVIEW**; a Replay match demonstrates synthetic behavior, not real model accuracy.

Regenerate from a downloaded reference folder:

```bash
node scripts/import-v2.mjs /absolute/path/to/HACKATHON-CODEX
```

Or run without an argument to rebuild generated files from the checked-in pair. Original v0.5 runtime/fixtures remain for rollback and regression checks. Old hosted sessions are preserved in storage; the v2 UI starts a fresh compatible session.

## Run locally

Node.js 22.13+ and npm:

```bash
npm ci
```

Create an ignored `.env` in this project:

```dotenv
OPENAI_API_KEY=your-own-key
ORDER_RESCUE_MODEL=gpt-6-sol
ORDER_RESCUE_RUNTIME=AGENTS_API
ORDER_RESCUE_AGENT_TIMEOUT_MS=110000
ORDER_RESCUE_MAX_TOOL_CALLS=7
```

Keep keys out of chat, Git and browser code. Replay needs no key. Build and initialize the local database once:

```bash
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_clear_warstar.sql
npm run dev
```

Open the printed Local URL, normally `http://127.0.0.1:5173/`. Hosted API keys are separate Sites runtime secrets. Local development has a local presenter identity; hosted API routes require ChatGPT sign-in.

## Verify

```bash
npm test
npm run typecheck
npm run demo          # 30 supplied draft v2.2 scenarios
npm run demo:legacy   # preserved 25-case v0.5 regression path
```

Live results can differ from scripted labels. A custom reply is never forced to a canned answer.

## Confidence and boundaries

The Decisions rating measures support for the proposed cause. Its weighted LOW/MEDIUM/HIGH score is scaled from 0–2 to 0–100, with demo bands 0–24, 25–74 and 75–100. Output validation caps the displayed band to the separate evidence-support result (and caps unknown causes at LOW), while retaining the raw score and cap reason. Scorer certainty is separate metadata. This is **not a calibrated delivery-success probability** and never overrides policy. T0 buyer context or verified operational evidence can support strong cause confidence while current intent/availability remain missing.

The policy workbook contains broader proposals and public references. Only the selected versioned demo profile supplies executable parameters; this is not verified live Shopee/SPX policy. No carrier integration, messaging, address/COD edits, refunds, returns or dispatch.

## Code map / publishing

- `app/page.tsx`, `app/globals.css`: colored three-panel workflow board.
- `app/api/`: authenticated case/session, reply and manual no-reply routes.
- `lib/order-rescue-v2/`: active v2.2 projection, simulator, hosted Agents API session adapter, loaded skills, backend business tools, Decisions contracts, policy, scoring, storage and evaluator.
- `ORDER_RESCUE_RUNTIME=LEGACY_RESPONSES`: explicit rollback to the retained Responses assessment path. Agents API errors never switch runtimes automatically.
- `fixtures/v2/`: versioned synthetic inputs and isolated replay/test data.
- `lib/order-rescue/`, original `fixtures/`: retained v0.5 rollback path.
- `db/`, `drizzle/`: existing D1 schema and migration; no new operational-schema migration was needed.

Preserve `.openai/hosting.json` Site identity/public audience and use Sites source/build/publication tools. Never commit env files, credentials, local databases, generated builds or node_modules.

# Order Rescue · OpenAI MVP v2.2

A delivery-recovery workspace for operations staff. **30 synthetic cases, demo policy, simulated outcomes.** Staff approves every handling decision; no messages or logistics actions are executed.

[Public demo](https://order-rescue-gpt-phuc.lankybluff1.chatgpt.site) · Teammates can sign in with their own ChatGPT accounts. Runs stay separate; the server uses the owner's API key for Live GPT.

## Use the app

1. Use the header button to switch **Tiếng Việt / English**. Your choice is remembered.
2. Choose **Buyer at work** or **Flooded delivery route**, or expand the scenario selector for all 30 cases.
3. **Replay → Use sample response → Review response** walks through prepared results without AI charges. **Live Agent** starts a real hosted assessment; a typed custom response explicitly uses Live Agent and API credits.
4. Copy the approved question into your normal channel, record the buyer’s exact reply, then assess it. **No reply** selects the initial result without another AI call.
5. Read **Policy & recommendation** in the right panel. Review evidence, the Decisions evidence-support score and history, then copy the recommendation for Ops.

6. Open **Agent trace** to inspect recorded stages, timings, evidence, policy rules and API operations. **Replay recorded trace** animates the saved execution without calling AI.

The homepage now uses Lucas’s Vietnamese/English UI with the existing v2.2 hosted agent backend. It derives holds, retries and unresolved outcomes from real API state. Source notes and buyer text remain in their original language. No real messages or delivery actions are executed. Reload restores the current review.

## Stack and flow

- Hosted OpenAI **Agents API** with one isolated, tool-free managed agent session per assessment (`gpt-5.4-mini`). The active backend uses native HTTPS, without an OpenAI client SDK.
- Direct Decisions API evidence-support scoring (`gpt-6-luna`) after each live assessment.
- React/Vinext/TypeScript on ChatGPT Sites / Cloudflare Workers; D1 stores sessions, two assessment slots, final selection and an append-only audit timeline.
- The same seven stages: `load-case → prepare-input → assess-case → validate-output → policy-gate → compose-recommendation → audit-log`.

At most **two assessments**: initial and after a matching buyer reply. Manual No reply selects initial exactly; there is no third assessment or second question. Concurrent outcomes are serialized before inference and saved with revision checks. Failures go to Ops without silent Replay fallback. Auth remains lightweight; no roles, teams or administration screens.

The nine logical tables from the supplied raw seed are joined into an explicit server-only input projection. Mutable review state uses the existing D1 tables, keeping the MVP small. Future replies, expected outputs and previous assessment/result slots are excluded from AI inputs. Buyer history stays empty where the seed provides none.

The hosted agent owns model execution and turn lifecycle. The application owns the fixed seven stages and deterministic policy gates. Each stage has a `SKILL.md` contract plus TypeScript implementation; Markdown files are documentation, not automatically registered callable tools. The assessor receives no tools, sandbox or subagents. Buyer questions and delivery actions remain staff-controlled.

Session, agent and turn IDs are saved in decision metadata and shown under **Technical details → Hosted agent session**. The backend checks the intended turn's terminal status and reads its durable final answer. Transient observation failures retry reads only; creation/input is never silently resubmitted. A timed-out or unexpectedly tool-requesting turn is cancelled with a bounded confirmation check; an unconfirmed cancellation is recorded and the case goes to Ops. An ambiguous lost creation response fails closed without a new session. No automatic cross-request resume is implemented in this MVP.

The current key needs Agents read/write and Responses write access. The default model was verified with a completed hosted turn; API credits and a ChatGPT subscription alone do not establish these permissions. Agent sessions retain the synthetic assessment input on OpenAI for audit; secrets and draft evaluator labels are never sent. The assessment prompt and six-field contract are unchanged.

## Data and reference documents

The user-selected contract is `order-rescue-demo-30-v2.2`, policy `demo-two-assessment-v2`. See [source mapping](docs/DATA-SOURCES.md).

`fixtures/v2/seed.json` and `test-cases.json` preserve the downloaded originals. `replay.json`, `controls.json` and `provenance.json` are generated from them. The supplied expected labels are **DRAFT_NEEDS_USER_REVIEW**; a Replay match demonstrates synthetic behavior, not real model accuracy.

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
ORDER_RESCUE_MODEL=gpt-5.4-mini
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

The Decisions rating measures support for the proposed cause. Its weighted LOW/MEDIUM/HIGH score is scaled from 0–2 to 0–100, with demo bands 0–24, 25–74 and 75–100. Source validation caps score and band together. Scorer certainty is separate metadata. This is **not a calibrated delivery-success probability** and never overrides policy. T0 buyer context or verified operational evidence can support strong cause confidence while current intent/availability remain missing.

The policy workbook contains broader proposals and public references. Only the selected versioned demo profile supplies executable parameters; this is not verified live Shopee/SPX policy. No carrier integration, messaging, address/COD edits, refunds, returns or dispatch.

## Code map / publishing

- `app/page.tsx`, `features/judge-demo/`: Lucas’s three-panel UI, live API adapter and local language switch.
- `app/api/`: authenticated case/session, reply and manual no-reply routes.
- `lib/order-rescue-v2/`: active v2.2 projection, simulator, seven skills, policy, scoring, storage and evaluator.
- `fixtures/v2/`: versioned synthetic inputs and isolated replay/test data.
- `lib/order-rescue/`, original `fixtures/`: retained v0.5 rollback path. Its SDK dependencies are development-only and excluded from the active runtime bundle.
- `db/`, `drizzle/`: existing D1 schema and migration; no new operational-schema migration was needed.

Preserve `.openai/hosting.json` Site identity/public audience and use Sites source/build/publication tools. Never commit env files, credentials, local databases, generated builds or node_modules.

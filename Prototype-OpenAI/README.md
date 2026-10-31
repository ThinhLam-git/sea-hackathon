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
- React/Vinext/TypeScript on ChatGPT Sites / Cloudflare Workers; the web application and agent implementation are separate source packages in this repository and ship in one Worker. D1 stores sessions, two assessment slots, final selection and an append-only audit timeline.
- The backend retains its seven deterministic stages: `load-case → prepare-input → assess-case → validate-output → policy-gate → compose-recommendation → audit-log`. Inside `assess-case`, one durable agent session extracts evidence, invokes the Decisions-backed business tools in order, and submits the six-field proposal for backend validation.
- Each Decisions request is checkpointed before dispatch and records its result, model, request ID when available, latency, usage availability, and sanitized status. Request cancellation stops new work, rejects stale commits, and sends a separate documented remote cancel event when a session turn is known.
- An owner-authenticated recovery endpoint inspects an interrupted remote session and reconciles only stored tool results. It never creates a replacement session or repeats an uncertain billable request.

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

The built Worker can also be started with `npm start`; it uses `.wrangler/state` for local D1 persistence. For that built config, Wrangler reads local secrets from `dist/server/.dev.vars` beside the generated `dist/server/wrangler.json`. Keep that file local and remove it after a bounded live rehearsal. Hosted deployments keep secrets in runtime bindings.

## Verify

```bash
npm test
npm run typecheck
npx tsc -p packages/contracts/tsconfig.json --noEmit
npx tsc -p packages/agent/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
npm run build
npm run demo          # 30 supplied draft v2.2 scenarios
npm run demo:legacy   # preserved 25-case v0.5 regression path
```

Live results can differ from scripted labels. A custom reply is never forced to a canned answer.

## Confidence and boundaries

The Decisions rating measures support for the proposed cause. Its weighted LOW/MEDIUM/HIGH score is scaled from 0–2 to 0–100, with demo bands 0–24, 25–74 and 75–100. Output validation caps the displayed band to the separate evidence-support result (and caps unknown causes at LOW), while retaining the raw score and cap reason. Scorer certainty is separate metadata. This is **not a calibrated delivery-success probability** and never overrides policy. T0 buyer context or verified operational evidence can support strong cause confidence while current intent/availability remain missing.

The policy workbook contains broader proposals and public references. Only the selected versioned demo profile supplies executable parameters; this is not verified live Shopee/SPX policy. No carrier integration, messaging, address/COD edits, refunds, returns or dispatch.

## Code map and boundaries

- `apps/web/app/`, `components/`, `hooks/`, `public/`: UI, styles, public assets, auth integration, and thin API routes.
- `apps/web/lib/application/`: use-case services, server-only v2.2 workflow data, evaluator adapter, and public view projection.
- `apps/web/lib/infrastructure/`: D1 persistence, owner scoping, runtime secret resolution, and agent recovery adapter. `apps/web/db/` is the Drizzle schema; `drizzle/` retains the existing migration.
- `apps/web/worker/index.ts`: the single Cloudflare Worker entry point. Root `vite.config.ts` keeps Vinext and the Cloudflare/Sites plugins at the repository root, with `apps/web` configured as Vinext's `appDir`.
- `packages/contracts/src/`: browser-safe DTOs and schemas. It imports Zod only and contains no provider, Worker, persistence, or secret configuration.
- `packages/agent/src/runtime/`, `decisions/`, `semantics/`, `workflow/`, `policy/`, `skills/`, `ports/`: Agents API sessions and recovery; Decisions; typed semantic facts; lifecycle and simulator; policy constraints; stage and hosted skills; and infrastructure interfaces. Agent code imports contracts and provider libraries, never UI, framework routes, Cloudflare bindings, browser state, or environment secrets.
- `packages/agent/src/skills/hosted/`: four app-local `SKILL.md` sources loaded into the Agents API session definition by Vite's raw asset imports.
- `fixtures/v2/`: v2.2 synthetic inputs and evaluator-only labels. Server-only adapters keep future replies and labels out of browser DTOs and live model input.
- `lib/order-rescue/` and original `fixtures/`: the v0.5 rollback path. `ORDER_RESCUE_RUNTIME=LEGACY_RESPONSES` explicitly selects its retained Responses assessment mode; Agents API errors never switch runtimes automatically.
- `tests/`, `scripts/`, `reports/`: retained and new regressions, replay tools, and implementation handover.

The refactor keeps one root npm install and one Workers deployment. It does not introduce a separate service, build system, or package-manager workspace migration. `apps/web/tsconfig.json`, `packages/agent/tsconfig.json`, and `packages/contracts/tsconfig.json` allow each boundary to be typechecked independently.

Preserve `.openai/hosting.json` Site identity/public audience and use Sites source/build/publication tools. Never commit env files, credentials, local databases, generated builds or node_modules.

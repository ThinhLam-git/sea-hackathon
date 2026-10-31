# Order Rescue · OpenAI prototype

A delivery-recovery workbench for the Sea × OpenAI Hackathon. **Synthetic data · Demo policy · Simulated outcomes.** Operations makes the handling decision.

## Stack

- **OpenAI Agents SDK**: one structured, tool-free assessment agent.
- **OpenAI Responses API**: GPT inference; default model remains `gpt-5.4-mini`.
- **ChatGPT Sites**: private hosted preview with ChatGPT sign-in.
- **React / Vinext / TypeScript**: site and server API.
- **Cloudflare D1**: durable runs and append-only decision history.

The earlier Python and VoltAgent prototypes are retained in the original workspace for comparison. This version has no VoltAgent or Vercel AI SDK dependency.

## Same seven-step pipeline

`load-case → prepare-input → assess-case → validate-output → policy-gate → compose-recommendation → audit-log`

Only `assess-case` calls GPT. Code controls the order and both policy gates. The model receives current inputs and raw sources, never the case title, future replies or golden answers.

The 25 cases, replay outputs, v0.5 policy and approved Vietnamese question/reason wording are preserved. New events append decisions; duplicates do not. A buyer can be asked at most one approved question. Timeout is not refusal. Model failures go to operations without a silent replay fallback.

## Run locally

Requires Node.js 22.13+ and npm.

```bash
npm ci
```

Create an ignored `.env` file in **this project directory** with your key:

```dotenv
OPENAI_API_KEY=your-own-key
ORDER_RESCUE_MODEL=gpt-5.4-mini
```

Keep the key out of chat, Git and browser code. Replay does not need a key. The site defaults to Replay; choosing **Live GPT** starts a fresh run and uses your API credits.

Build and initialize the local database once:

```bash
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_clear_warstar.sql
npm run dev
```

Open the Local URL printed by the server, normally `http://127.0.0.1:5173/`.

Local development supports a local presenter. Production API routes require ChatGPT identity and isolate runs by user. Live availability is checked on the server; keys never enter client props or API responses. Hosted keys are configured as Sites runtime secrets, separately from local `.env` files.

## Verify

```bash
npm test             # golden cases and safety/migration checks
npm run typecheck
npm run demo         # all 25 cases against expected replay answers
npm run build
```

Demo cases: `OR-001` buyer reply → retry, `OR-009` timeout → operations, `OR-023` address-change request → operations, `OR-038` verified flooding → hold, `OR-051` unsafe note → stop before AI.

## Important demo distinction

`fixtures/replay/` contains **hand-authored seeds**, not recorded model outputs. A 25/25 replay match validates the code path and rules, not model accuracy. Live GPT can give a different proposal; validation and policy checks still apply.

## Code map

- `app/page.tsx`, `app/globals.css`: responsive workbench.
- `app/api/`: case, run, event, virtual-clock and configuration routes.
- `lib/order-rescue/pipeline.ts`: fixed seven-stage orchestration; optional OpenAI tracing.
- `lib/order-rescue/skills/`: the seven skills and original prompt.
- `lib/order-rescue/simulator.ts`: current state, prepared events, one-question limit and virtual clock.
- `lib/order-rescue/repository.ts`: D1 persistence with revision checks and append-only history.
- `fixtures/`: unchanged synthetic cases, replay seeds and demo policy.
- `db/schema.ts`, `drizzle/`: schema and immutable migrations.
- `tests/`: preserved regressions plus migration-specific checks.

Live assessments use one SDK turn and no tools or handoffs. API persistence disables response storage; trace export is off by default. The decision timeline works in both modes.

## Deployment

`.openai/hosting.json` retains this preview's Site identity and D1 binding. Use the Sites source/build/publication workflow to update it. Hosted migrations are applied by Sites before deployment. Never commit `.env`, `.dev.vars`, credentials, local databases, generated builds or `node_modules`.

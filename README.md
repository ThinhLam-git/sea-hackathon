# Sea × OpenAI Codex Hackathon

Workspace for our Sea × OpenAI Codex Hackathon team.

## Current stage

The team has selected one pre-build product direction:

- **Order Rescue Agent** — a policy-gated AI decision layer for failed last-mile deliveries.

Project research, meeting briefs, and source materials are in [`process/context/ideas/`](process/context/ideas/).

## Team

Lucas, Hải, Kha, and Phúc.

## Working principle

Prototype only what we can demonstrate truthfully. Any unavailable integrations, live data, or business outcomes must be clearly labelled **SIMULATED** or **FUTURE**.

## OpenAI prototype (`phuc-dev`)

The working prototype is in [`Prototype-OpenAI/`](Prototype-OpenAI/README.md). It uses OpenAI Agents SDK + Responses API, a dark navy React workbench, the same seven-step policy pipeline, and all 25 v0.5 simulation cases.

```bash
cd Prototype-OpenAI
npm ci
npm test
npm run typecheck
npm run build
```

See the project README for local database setup, secure API-key configuration, and the private Sites preview. API keys and local run data are excluded from Git.

Private preview: [Order Rescue · GPT Operations](https://order-rescue-gpt-phuc.lankybluff1.chatgpt.site). Sign in with the owning ChatGPT account; access stays private.

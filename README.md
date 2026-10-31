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

The working prototype is in [`Prototype-OpenAI/`](Prototype-OpenAI/README.md). It uses the hosted OpenAI Agents API + Decisions API over native HTTPS, a colored three-panel staff workspace with a progress tracker and confidence/evidence side panel, the same seven-step assessment pipeline, and all 30 supplied v2.2 synthetic cases. Manual No reply selects the initial assessment; a matching reply selects the second. The original 25-case version remains available for regression checks and rollback.

```bash
cd Prototype-OpenAI
npm ci
npm test
npm run typecheck
npm run build
```

See the project README for local database setup, secure API-key configuration, and the public Sites preview. API keys and local run data are excluded from Git.

Public preview: [Order Rescue · GPT Operations](https://order-rescue-gpt-phuc.lankybluff1.chatgpt.site). Teammates can sign in with their own ChatGPT accounts to use the demo.

The v2.2 source mapping and draft-label distinction are documented in [`Prototype-OpenAI/docs/DATA-SOURCES.md`](Prototype-OpenAI/docs/DATA-SOURCES.md). Original Drive documents remain downloaded locally; reviewed synthetic seed/test data is included in the app.

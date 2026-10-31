---
name: assess-case
description: Produce the strict six-field v2.2 assessment.
---

# assess-case

Input/output: v2.2 `PipelineState` from `../../models.ts`. One isolated hosted Agents API session/turn (native HTTPS, environment `none`, no tools/subagents) plus one Decisions score in Live; isolated hand-authored draft assessment in Replay. Read durable final output only after the intended turn completes. Save session/agent/turn IDs; cancel unfinished work on timeout. Retry observations, never ambiguous creation/input. Fail closed without SDK fallback.

Policy: `demo-two-assessment-v2`. The fixed pipeline owns execution order.

---
name: assess-case
description: Produce the strict six-field v2.5 assessment.
---

# assess-case

Input/output: v2.5 `PipelineState` from `../../models.ts`. One isolated hosted Agents API session/turn using `gpt-6-sol` with reasoning effort `medium` (native HTTPS, environment `none`, no tools/subagents) plus one Decisions score in Live; isolated hand-authored draft assessment in Replay. Read durable final output only after the intended turn completes. Save session/agent/turn IDs; cancel unfinished work on timeout. Retry observations, never ambiguous creation/input. Fail closed without SDK fallback.

Policy: `demo-two-assessment-v2.5`. The fixed pipeline owns execution order.

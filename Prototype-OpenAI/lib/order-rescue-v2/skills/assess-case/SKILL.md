---
name: assess-case
description: Produce the strict six-field v2.2 assessment.
---

# assess-case

Input/output: v2.2 `PipelineState` from `../../models.ts`. One tool-free Responses turn plus one Decisions score in Live; isolated hand-authored draft assessment in Replay. Fail closed without fallback.

Policy: `demo-two-assessment-v2`. The fixed pipeline owns execution order.

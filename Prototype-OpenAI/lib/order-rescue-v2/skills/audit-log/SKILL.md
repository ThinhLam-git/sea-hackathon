---
name: audit-log
description: Record an append-only assessment decision.
---

# audit-log

Input/output: v2.2 `PipelineState` from `../../models.ts`. Earlier decisions remain unchanged. Manual no-reply is a separate final-selection audit event, never another assessment.

Policy: `demo-two-assessment-v2`. The fixed pipeline owns execution order.

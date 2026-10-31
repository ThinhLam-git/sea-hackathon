---
name: load-case
description: Validate raw input and lifecycle before AI.
---

# load-case

Input/output: v2.5 `PipelineState` from `../../models.ts`. Stop malformed/unsafe input, unsupported lifecycle, stale triggers, expired deadline and exhausted attempts.

Policy: `demo-two-assessment-v2.5`. The fixed pipeline owns execution order.

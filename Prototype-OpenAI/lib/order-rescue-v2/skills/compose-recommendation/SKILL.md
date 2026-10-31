---
name: compose-recommendation
description: Compose the decision and optional one permitted question.
---

# compose-recommendation

Input/output: v2.5 `PipelineState` from `../../models.ts`. Only initial assessment can emit a question. No model or code step executes logistics.

Policy: `demo-two-assessment-v2.5`. The fixed pipeline owns execution order.

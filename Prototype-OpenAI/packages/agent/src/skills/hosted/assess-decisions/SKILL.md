---
name: assess-decisions
description: Use recorded Decisions results to assess cause, confidence support, and candidate recovery action.
---

Call `evaluate_hypothesis` after extracting evidence. Assess buyer intent, availability, COD readiness, conflicts, and missing facts from the current sources. Call `evaluate_action` only after the hypothesis tool returns. Preserve decision IDs, full probability distributions, and API confidence separately. Do not equate a choice probability with delivery-success probability. Treat unknown, conflict, refusal, and tool errors as unresolved; never invent an output.

---
name: policy-gate
description: Gate 2, post-AI policy gate. Checks the candidate action against the demo rules (sheet 05) on the latest state and produces policy_gate (PERMITTED / BLOCKED / ESCALATED), final_action and the rule IDs. Confidence HIGH never overrides policy.
---

# policy-gate (Gate 2)

**Runs:** always, also after an earlier stop (it then only adds R13 when the reply window timed out). **Calls a model:** no.

## Check order
1. **Latest state:** re-run Gate 1 (`load-case.check`).
2. **Escalation** → `ESCALATED`, `final_action = ESCALATE_REVIEW`:

| Rule | Condition |
|---|---|
| R06 | `address_change_needed` (address edits are outside MVP) |
| R08 | hypothesis `UNVERIFIED_REFUSAL` |
| R09 | `sources_conflict` |
| R03 | `availability = ONLY_AFTER_DEADLINE` |
| R13 | reply window timed out with no buyer reply (no reply is not refusal) |
| R10 | hypothesis `SERVICE_DISRUPTION` but the disruption is not VERIFIED or does not match route/time |

3. **Candidate action:**

| Candidate | Permitted when | Result |
|---|---|---|
| `CLARIFY` | no question asked yet, approved `question_key` | `PERMITTED`, record `PENDING` (R12). If already asked and still inside the window → `NO_ACTION`, `PENDING`. Otherwise `ESCALATED` (R12). |
| `STANDARD_REATTEMPT` | R05: `buyer_intent = WANTS`, `availability = CONFIRMED`, location clear (landmark given if the hypothesis is `UNCLEAR_LANDMARK`), no active disruption | `PERMITTED`, `FINAL`. Otherwise `ESCALATED` with `R05:<missing>`. |
| `HOLD_DISRUPTION` | R10: disruption VERIFIED, ACTIVE, same route, started before the failed attempt, has `reassess_at` | `PERMITTED`, `PENDING` until `reassess_at`. Otherwise `ESCALATED` (R10). |
| `NO_ACTION` | waiting inside the reply window | `PERMITTED`, `PENDING`. Otherwise `ESCALATED` (R12). |
| `ESCALATE_REVIEW` | always | `ESCALATED` (`AGENT_ESCALATE`). |

## Rules
- Never upgrade a step; only keep it or downgrade it to `ESCALATE_REVIEW`.
- `PENDING` records are runtime state; the sheet stores no final policy output for them.

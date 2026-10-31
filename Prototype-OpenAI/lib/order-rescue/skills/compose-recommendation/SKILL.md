---
name: compose-recommendation
description: Turns the policy result into the decision record shown to Ops - the 4 Final Policy Output fields (eligibility, policy_gate, final_action, reason) with approved Vietnamese wording per rule ID, plus the 6 Agent Output fields when the AI ran.
---

# compose-recommendation

**Runs:** always. **Calls a model:** no.

## Output: `state.decision`
| Field | Source |
|---|---|
| `record_status` | `PENDING` (waiting for a reply or a reassessment), `FINAL`, or `NO_CHANGE` (duplicate event, R20) |
| `eligibility`, `policy_gate`, `final_action` | `state.result` |
| `reason` | Joined texts of the rule IDs, from `RULE_TEXT` in `skill.ts` |
| `headline` | Short Vietnamese headline for the final action |
| `agent` | The 6 Agent Output fields + findings (`None` if the AI step did not run) |
| `question_text` | Approved template text when `final_action = CLARIFY` |

## Wording rules
- Reasons come only from `RULE_TEXT`. The model's `explanation` is kept inside `agent` for audit and never used as the reason.
- Every decision carries the labels **Dữ liệu giả lập · Luật minh họa · Kết quả mô phỏng** plus the mode.

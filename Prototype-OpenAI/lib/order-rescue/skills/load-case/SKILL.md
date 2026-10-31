---
name: load-case
description: Gate 1, eligibility pre-check. Validates the 7 Agent Input fields against the demo policy before any AI call. Sets eligibility (ELIGIBLE / INELIGIBLE / UNKNOWN) and stops cases that must go to Ops without AI.
---

# load-case (Gate 1: eligibility pre-check)

**Runs:** first, on every assessment. `policy-gate` runs `check()` again on the latest state. **Calls a model:** no.

## Input
`state.run.input` (7 fields), `state.run.now` (virtual clock), `state.policy`.

## Output
`state.result.eligibility`, and for stopped cases `policy_gate`, `final_action = ESCALATE_REVIEW`, rule ID.

## Checks, in order (sheet 05)

| Rule | Condition | eligibility | policy_gate |
|---|---|---|---|
| R20 | `operational_context.duplicate_trigger` or `latest_status = DELIVERED` | — | — (record `NO_CHANGE`) |
| R15 | `operational_context.pii_quarantined` | UNKNOWN | BLOCKED |
| R01 | `return_state` STARTED / COMPLETED | INELIGIBLE | BLOCKED |
| R02 | `return_state` UNKNOWN or `deadline` null | UNKNOWN | ESCALATED |
| R03 | Virtual clock past `deadline` | INELIGIBLE | BLOCKED |
| R04 | `attempts_used >= max_attempts` (demo: 3) | INELIGIBLE | BLOCKED |
| R19 | `operational_context.untrusted_note_flag` (prompt injection) | ELIGIBLE | ESCALATED |
| R21 | `operational_context.request_actor_role = SELLER` | ELIGIBLE | ESCALATED |
| R22 | `operational_context.recipient_detail_requires_ops_verification` | ELIGIBLE | ESCALATED |

Stopped cases skip the AI step (no Agent Output), as in the sheet.

## Rules
- Missing values stay unknown. Never guess a deadline or return state.
- A buyer reply never overrides a return in progress or an expired deadline.

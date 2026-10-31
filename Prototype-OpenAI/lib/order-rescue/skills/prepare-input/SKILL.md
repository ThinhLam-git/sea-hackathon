---
name: prepare-input
description: Builds what the model may see - the 7 Agent Input fields plus the raw sources (sheet 04) available at the virtual "now". Contains no evidence; building evidence is the AI's job.
---

# prepare-input

**Runs:** after Gate 1 passes. **Calls a model:** no.

## Output
- `state.snapshot`: JSON sent to the model.
- `state.source_index`: `{source_ref: Source}` used by `validate-output` and `policy-gate`.

## Snapshot contents
| Key | Content |
|---|---|
| `agent_input` | The 7 fields: `case_id`, `failed_event`, `attempts_used`, `return_state`, `deadline`, `buyer_history`, `operational_context` |
| `sources` | T0 sources plus RUNTIME sources already applied, each with `source_ref`, `source_type`, `actor`, `occurred_at`, `content` |
| `question_state` | Questions asked, key, reply deadline, whether a reply came, whether the window timed out |
| `approved_questions` | Keys of the approved templates |
| `now`, `policy_version` | Virtual clock and policy version |

## Never in the snapshot
- `evidence[]` (sheet rule 1: evidence is Agent output, not input).
- `group`, `title` and `expected` (golden answers).
- RUNTIME sources not yet applied (the future).

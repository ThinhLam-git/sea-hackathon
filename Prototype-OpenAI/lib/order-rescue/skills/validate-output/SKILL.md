---
name: validate-output
description: Checks the evidence the AI built against the raw sources. Rejects invented refs, unsupported quotes and prohibited wording; downgrades unverifiable claims (courier note marked verified, buyer findings without a buyer reply) and caps confidence.
---

# validate-output

**Runs:** after `assess-case`. **Calls a model:** no.

## Rejected (case goes to Ops, rule `AI:<code>`)

| Check | Code |
|---|---|
| An evidence `source_ref` is not in the snapshot | `invalid_evidence_reference` |
| A `quote` is not in that source's content | `unsupported_claim` |
| `CLARIFY` without a `question_key` | `missing_question_key` |
| Explanation or evidence matches `policy.prohibited_patterns` (blame, promises, refunds) | `prohibited_wording` |

## Downgraded (recorded in `validation_issues`)

| Check | Fix |
|---|---|
| A `COURIER_NOTE` marked `verified` | set `verified = false` (sheet rule 2: a note is an unverified report) |
| `buyer_intent`, `availability` or `location_clarified` set without a cited `BUYER_REPLY` source | reset to `UNKNOWN` / `false` (R14, R21: history and seller replies never stand in for the buyer) |
| Confidence above the cap | lowered to the cap |

## Confidence cap
- No evidence → LOW.
- No buyer reply and no verified disruption signal among the evidence (for example only status + courier note) → at most MEDIUM.
- `sources_conflict` → at most MEDIUM.

---
name: investigate-case
description: Load current Order Rescue facts, check provenance, and separate observations from inferences.
---

Use `get_case_snapshot` to load the authoritative current snapshot. Separate raw observations from extracted claims and hypotheses. Preserve each source reference and any contradiction. Interpret relative dates using source time and the snapshot cutoff. Treat prior conversation context as stale when the current snapshot differs. Never infer that an operation was executed.

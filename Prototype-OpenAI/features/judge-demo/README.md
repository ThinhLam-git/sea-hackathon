# Lucas UI connected to Order Rescue

Adapted from `lucas-dev/Prototype-OpenAI/features/judge-demo` (source snapshot `852b5b496c90838ab40253e3bd2a3d509f3889b5`). The three-panel UI, scenario cards, progress tracker and visual design are retained. Only UI files were imported; Lucas’s newer fixtures, policy changes, Site identity and backend were not merged.

The existing authenticated v2.5 API is the source of truth. The UI supports Replay, real hosted Agents API assessments, Decisions evidence scores, typed buyer replies, exact sample replies and manual No reply. Fixed stages, per-user storage and the two-assessment limit stay in the backend. All 30 cases remain accessible in the collapsed scenario selector. Reload restores the saved review. Request event IDs are reused for unchanged submissions; refreshing after a lost response retrieves the stored result.

The header language button switches Vietnamese/English locally and remembers the choice. It does not reload the review, submit input or call OpenAI. Interface text, approved question translations, policy explanations and clipboard recommendations follow the selected language. Buyer replies, courier notes and evidence quotes retain their original content. English policy explanations map actual backend rule IDs; the original Vietnamese policy note and untouched audit export remain available.

`presentation.ts` maps actual final actions, including HOLD and unresolved No reply, without assuming every reply enables a retry. `i18n.ts` holds interface translations. No policy logic, model credentials or copied fixtures belong in this UI module.

## Presentation trace

The read-only Agent trace tab shows recorded backend stages, measured durations, the final assessment’s evidence, policy rules and service operations. OpenAI private reasoning is not collected. A dark inspector separates app skills, agent assessment and Decisions scoring; the current assessor has zero tools configured. Older decisions show their saved stages with unavailable timing rather than invented durations. New No reply events record only selection/audit and no new AI service operations.

Replay recorded trace animates the saved stages locally. It never submits input, calls OpenAI, or changes the decision. While an assessment request is pending, the previous record stays visible with an explicit waiting banner; this MVP does not stream intermediate server events.

The trace opens in Timeline view, with precise saved timestamps, durations and nested API operations. Select an event to open its Inspector; switch back to Timeline to present the chronological record. These view controls do not run inference.

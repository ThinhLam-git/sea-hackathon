import type { PipelineState } from "../../models";
export const RUNS_WHEN_HALTED = true;
/** Persistence commits this decision and run state together in one D1 batch. No history is overwritten. */
export function run(state: PipelineState): PipelineState {
  state.decision!.snapshot_source_refs = Object.keys(state.source_index).sort();
  state.decision!.skills_run = [...state.trace, "audit-log"];
  return state;
}

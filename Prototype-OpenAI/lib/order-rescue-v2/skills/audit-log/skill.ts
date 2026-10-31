import type { PipelineState } from "../../models";
export const RUNS_WHEN_HALTED=true;
export function run(s:PipelineState){s.decision!.skills_run=[...s.trace];return s;}

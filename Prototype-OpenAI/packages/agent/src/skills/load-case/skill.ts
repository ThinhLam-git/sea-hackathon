import { check } from "../../policy/guards";
import type { PipelineState } from "../../models";
export const RUNS_WHEN_HALTED=false;
export function run(s:PipelineState){check(s);return s;}

import type { RuntimeConfig } from "../order-rescue/pipeline";
import type { PipelineState } from "./models";
import * as load from "./skills/load-case/skill";
import * as prepare from "./skills/prepare-input/skill";
import * as assess from "./skills/assess-case/skill";
import * as validate from "./skills/validate-output/skill";
import * as policy from "./skills/policy-gate/skill";
import * as compose from "./skills/compose-recommendation/skill";
import * as audit from "./skills/audit-log/skill";
export const PIPELINE=[
 ["load-case",load,"Check raw input and lifecycle"],["prepare-input",prepare,"Project current raw sources only"],
 ["assess-case",assess,"Six-field assessment + Decisions confidence"],["validate-output",validate,"Validate sources, verification and confidence"],
 ["policy-gate",policy,"Compute policy from current evidence"],["compose-recommendation",compose,"Compose recommendation and one permitted question"],
 ["audit-log",audit,"Append an immutable decision record"],
] as const;
export async function runPipeline(state:PipelineState,config:RuntimeConfig={}){
 for(const [name,skill] of PIPELINE){if(state.halted&&!skill.RUNS_WHEN_HALTED)continue;state.trace.push(name);state=await skill.run(state,config);}
 return state;
}

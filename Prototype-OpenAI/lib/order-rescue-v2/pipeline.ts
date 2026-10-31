import type { RuntimeConfig } from "../server-runtime";
import type { PipelineState, ExecutionStep } from "./models";
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
 const events:ExecutionStep[]=[];
 for(const [name,skill,purpose] of PIPELINE){
  const started=Date.now(),started_at=new Date(started).toISOString();
  const kind=name==="assess-case"?"agent":name==="policy-gate"?"policy":"skill";
  if(state.halted&&!skill.RUNS_WHEN_HALTED){events.push({name,kind,status:"skipped",started_at,duration_ms:0,summary:purpose});continue;}
  const wasHalted=state.halted;
  state.trace.push(name);state=await skill.run(state,config);
  events.push({name,kind,status:!wasHalted&&state.halted?"halted":"completed",started_at,duration_ms:Math.max(0,Date.now()-started),summary:purpose});
 }
 // Attach after audit-log, before the controller appends the immutable decision.
 if(state.decision)state.decision.execution_trace=events;
 return state;
}

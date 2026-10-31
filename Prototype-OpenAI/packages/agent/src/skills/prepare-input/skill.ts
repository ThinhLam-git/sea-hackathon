import { POLICY_VERSION, QUESTIONS, ms, type PipelineState } from "../../models";
export const RUNS_WHEN_HALTED=false;
export function run(s:PipelineState){
 const r=s.run,i=r.input;
 const sources=[...r.case.sources,...r.applied].filter(x=>ms(x.occurred_at)<=ms(r.now));
 s.source_index=Object.fromEntries(sources.map(x=>[x.source_ref,x]));
 s.snapshot={assessment_stage:s.stage,now:r.now,policy_version:POLICY_VERSION,
  core_input:{case_id:i.case_id,failed_event:structuredClone(i.failed_event),attempts_used:i.attempts_used,return_state:i.return_state,deadline:i.deadline,buyer_history:structuredClone(i.buyer_history),operational_context:structuredClone(i.operational_context)},
  runtime_context:r.applied.map(x=>structuredClone(x)),raw_sources:sources.map(x=>structuredClone(x)),
  question_state:r.question_wait_state?structuredClone(r.question_wait_state):null,approved_questions:QUESTIONS};
 return s;
}

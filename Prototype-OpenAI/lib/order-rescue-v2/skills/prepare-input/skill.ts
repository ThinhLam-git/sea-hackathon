import { POLICY_VERSION, QUESTIONS, ms, stop, type PipelineState } from "../../models";
export const RUNS_WHEN_HALTED=false;
export function run(s:PipelineState){
 const r=s.run,i=r.input;
 if(i.case_id!==r.case.case_id||[...r.case.sources,...r.applied].some(x=>!x.source_ref.startsWith(`${i.case_id}-`))){stop(s,"SOURCE_OWNERSHIP","Nguồn không thuộc case hiện tại; chuyển Ops.");return s;}
 const sources=[...r.case.sources,...r.applied].filter(x=>ms(x.occurred_at)<=ms(r.now));
 s.source_index=Object.fromEntries(sources.map(x=>[x.source_ref,x]));
 const context=structuredClone(i.operational_context);
 if(context.source_refs)context.source_refs=context.source_refs.filter((ref:string)=>!!s.source_index[ref]);
 if(context.buyer_messages_t0)context.buyer_messages_t0=context.buyer_messages_t0.filter((message:{source_ref:string;occurred_at?:string})=>{
  const source=s.source_index[message.source_ref];
  return source?.source_type==="BUYER_MESSAGE"&&(!message.occurred_at||ms(message.occurred_at)<=ms(r.now));
 }).map((message:{source_ref:string})=>{const source=s.source_index[message.source_ref];return {source_ref:source.source_ref,text:source.content.text,occurred_at:source.occurred_at};});
 for(const key of ["disruption","address_validation"]){
  const source=sources.find(source=>source.source_type==="OPS_CONTEXT"&&source.content?.[key]);
  if(source)context[key]=structuredClone(source.content[key]);else delete context[key];
 }
 // The gate must use the same time-bounded operational context that the model sees.
 i.operational_context=context;
 s.snapshot={assessment_stage:s.stage,now:r.now,policy_version:POLICY_VERSION,
  core_input:{case_id:i.case_id,failed_event:structuredClone(i.failed_event),attempts_used:i.attempts_used,return_state:i.return_state,deadline:i.deadline,buyer_history:structuredClone(i.buyer_history),operational_context:context},
  runtime_context:r.applied.filter(x=>sources.includes(x)).map(x=>structuredClone(x)),raw_sources:sources.map(x=>structuredClone(x)),
  question_state:r.question_wait_state?structuredClone(r.question_wait_state):null,approved_questions:QUESTIONS};
 return s;
}

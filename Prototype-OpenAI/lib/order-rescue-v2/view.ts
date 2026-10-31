import { sourceText } from "../order-rescue/models";
import { comparison, expectedFor } from "./evaluator";
import { profile } from "./fixtures";
import { PIPELINE } from "./pipeline";
import type { Simulator } from "./simulator";
import { policyOnly } from "./models";
export function runView(sim:Simulator,id:string){
 const r=sim.runs.get(id)!,q=r.question_wait_state,sources=[...r.case.sources,...r.applied],test=expectedFor(r.case.case_id),sample=test.simulation.buyer_reply;
 const history=sim.history(id).map(d=>({...structuredClone(d),agent:d.agent?{...structuredClone(d.agent),evidence:d.agent.evidence.map(e=>({...e,verified:e.verification!=="UNVERIFIED_REPORT",quote:sourceText(sources.find(s=>s.source_ref===e.source_ref)!)}))}:null}));
 const latest=history.at(-1)!;
 return {run_id:id,case_id:r.case.case_id,title:sim.listCases().find(c=>c.case_id===r.case.case_id)!.title,group:test.group,
  mode:sim.mode,now:r.now,input:r.input,limits:{max_attempts:profile.maximum_attempts,max_questions:profile.maximum_buyer_questions},contract_version:r.contract_version,lifecycle:r.current_status,
  question:{asked:q?1:0,key:q?.question_key??null,question_id:q?.question_id??null,deadline:null,replied:q?.status==="ANSWERED",timed_out:false,no_reply:q?.status==="NO_REPLY"},
  sources,events:sample?[{source_ref:`${r.case.case_id}-REPLY`,type:"BUYER_REPLY",text:sample,occurred_at:r.now,applied:!!r.after_reply_policy_output,available:r.current_status==="WAITING_FOR_BUYER"}]:[],
  pipeline:PIPELINE.map(([name,,purpose])=>({name,purpose})),history,
  golden:r.contract_version==="2.4"?comparison(r.case.case_id,{...latest,final_assessment_source:r.final_assessment_source}):[],expected:r.contract_version==="2.4"?test.expected:null,
  assessment_slots:{initial:r.initial_assessment,after_reply:r.after_reply_assessment,final:r.final_assessment,selected:r.final_assessment_source},
  policy_slots:{initial:r.initial_policy_output,after_reply:r.after_reply_policy_output,final:r.final_policy_output},
  ground_truth_status:r.contract_version==="2.4"?"FINAL":"DRAFT_NEEDS_USER_REVIEW",read_only:r.contract_version!=="2.4",final_event:r.final_event};
}
export type RunView=ReturnType<typeof runView>;

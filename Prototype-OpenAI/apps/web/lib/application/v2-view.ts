import { sourceText, type PublicRunView } from "../../../../packages/contracts/src/index";
import { PIPELINE } from "../../../../packages/agent/src/workflow/pipeline";
import type { Simulator } from "../../../../packages/agent/src/workflow/simulator";
import { profile, workflowData } from "./v2-workflow-data";
import { policyOnly } from "../../../../packages/agent/src/models";
export function runView(sim:Simulator,id:string):PublicRunView{
 const r=sim.runs.get(id)!,q=r.question_wait_state,sources=[...r.case.sources,...r.applied];
 const history=sim.history(id).map(d=>({...structuredClone(d),agent:d.agent?{...structuredClone(d.agent),evidence:d.agent.evidence.map(e=>({...e,verified:e.verification!=="UNVERIFIED_REPORT",quote:sourceText(sources.find(s=>s.source_ref===e.source_ref)!)}))}:null}));
 return {run_id:id,case_id:r.case.case_id,title:sim.listCases().find(c=>c.case_id===r.case.case_id)!.title,group:sim.listCases().find(c=>c.case_id===r.case.case_id)!.group,
  mode:sim.mode,now:r.now,input:r.input,limits:{max_attempts:profile.maximum_attempts,max_questions:profile.maximum_buyer_questions},contract_version:r.contract_version,lifecycle:r.current_status,
  question:{asked:q?1:0,key:q?.question_key??null,question_id:q?.question_id??null,deadline:null,replied:q?.status==="ANSWERED",timed_out:false,no_reply:q?.status==="NO_REPLY"},
  sources,events:[],sample_reply_available:q?.status==="PENDING"&&!!workflowData.replaySampleReply?.(r.case.case_id),
  pipeline:PIPELINE.map(([name,,purpose])=>({name,purpose})),history,golden:[],expected:null,
  assessment_slots:{initial:r.initial_assessment,after_reply:r.after_reply_assessment,final:r.final_assessment,selected:r.final_assessment_source},
  policy_slots:{initial:r.initial_policy_output,after_reply:r.after_reply_policy_output,final:r.final_policy_output},
  ground_truth_status:"DRAFT_NEEDS_USER_REVIEW",final_event:r.final_event};
}
export type RunView=PublicRunView;

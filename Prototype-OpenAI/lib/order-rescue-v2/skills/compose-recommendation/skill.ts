import { POLICY_VERSION, focusedQuestion, type PipelineState } from "../../models";
export const RUNS_WHEN_HALTED=true;
export function run(s:PipelineState){
 const a=s.assessment,result=s.result!;
 const mayAsk=s.stage==="INITIAL"&&result.policy_gate==="PERMITTED"&&result.final_action==="CLARIFY"&&a?.question_key&&a.missing_info.length>0;
 s.decision={...result,decision_id:crypto.randomUUID(),run_id:s.run.run_id,case_id:s.run.case.case_id,trigger:s.trigger,decided_at:s.run.now,
  record_status:mayAsk?"PENDING":"FINAL",agent:a?structuredClone(a):null,...s.confidence_score?{confidence_score:structuredClone(s.confidence_score)}:{},
  question_text:mayAsk?focusedQuestion(a!):null,rules:[...s.rules],validation_issues:[...s.issues],skills_run:[],model_info:structuredClone(s.model_info),
  policy_version:POLICY_VERSION,snapshot_source_refs:Object.keys(s.source_index),workflow_execution_id:s.execution_id,reassess_at:null,
  labels:["Dữ liệu giả lập","Luật minh họa","Kết quả mô phỏng"]};
 return s;
}

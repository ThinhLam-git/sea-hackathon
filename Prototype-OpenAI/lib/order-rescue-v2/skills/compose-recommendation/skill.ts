import { POLICY_VERSION, QUESTIONS, type PipelineState } from "../../models";
export const RUNS_WHEN_HALTED=true;
export function run(s:PipelineState){
 const a=s.assessment,result=s.result!;
 const replayMayAsk=s.mode==="REPLAY"&&s.stage==="INITIAL"&&result.policy_gate==="PERMITTED"&&a?.question_key&&a.missing_info.length>0;
 const legacyMayAsk=s.mode==="LIVE_AI"&&s.model_info.api==="Responses API"&&s.stage==="INITIAL"&&result.policy_gate==="PERMITTED"&&a?.question_key&&a.missing_info.length>0;
 const agentMayAsk=s.mode==="LIVE_AI"&&s.stage==="INITIAL"&&result.policy_gate==="PERMITTED"&&s.requested_question&&a?.question_key===s.requested_question.question_key;
 const mayAsk=!!(replayMayAsk||legacyMayAsk||agentMayAsk);
 const questionText=agentMayAsk?s.requested_question!.question_text:replayMayAsk||legacyMayAsk?QUESTIONS[a!.question_key!]:null;
 s.decision={...result,decision_id:crypto.randomUUID(),run_id:s.run.run_id,case_id:s.run.case.case_id,trigger:s.trigger,decided_at:s.run.now,
  record_status:mayAsk?"PENDING":"FINAL",agent:a?structuredClone(a):null,...s.confidence_score?{confidence_score:structuredClone(s.confidence_score)}:{},
  question_text:questionText,rules:[...s.rules],validation_issues:[...s.issues],skills_run:[],model_info:structuredClone(s.model_info),
  policy_version:POLICY_VERSION,snapshot_source_refs:Object.keys(s.source_index),workflow_execution_id:s.execution_id,reassess_at:null,
  labels:["Dữ liệu giả lập","Luật minh họa","Kết quả mô phỏng"]};
 return s;
}

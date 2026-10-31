import { AssessmentSchema, CONTRACT_VERSION, POLICY_VERSION, HYPOTHESES, MISSING, sourceText, type AgentInput, type ConfidenceScore, type Decision, type PolicyOutput, type RawCase, type Source, type Assessment as AssessmentType } from "../../contracts/src/index";
import type { BuyerInterpretation } from "./semantics/business-facts";
import type { ActionDecision, HypothesisDecisionRef } from "./decisions";
export const Assessment = AssessmentSchema;
export type Assessment = AssessmentType;
export { CONTRACT_VERSION, POLICY_VERSION, HYPOTHESES, MISSING, sourceText };
export type { AgentInput, ConfidenceScore, Decision, PolicyOutput, RawCase, Source };
export interface Question {question_id:string;question_key:NonNullable<Assessment["question_key"]>;question_text:string;status:"PENDING"|"ANSWERED"|"NO_REPLY";asked_at:string}
export type DecisionFailureCategory="authentication"|"quota"|"rate_limit"|"timeout"|"cancelled"|"network"|"provider"|"invalid_output"|"refusal"|"tool_validation"|"unknown";
export interface AgentToolLedgerEntry {
 tool_id:string;attempt_id?:string;external_call_id:string|null;session_id:string|null;turn_id?:string|null;phase:"INITIAL"|"AFTER_REPLY";
 tool_name:string;purpose?:string;status:"IN_PROGRESS"|"COMPLETED"|"SUCCEEDED"|"REFUSED"|"INVALID_OUTPUT"|"ERROR"|"AMBIGUOUS"|"CANCELLED_BEFORE_DISPATCH";result:unknown;
 started_at:string;completed_at:string|null;latency_ms:number|null;decision_ids:string[];
 execution_id?:string;snapshot_hash?:string;requested_model?:string;returned_model?:string|null;request_id?:string|null;usage?:unknown;provider_response?:unknown;
 failure_category?:DecisionFailureCategory;delivery_status?:"NOT_STARTED"|"SUBMITTING"|"ACCEPTED"|"AMBIGUOUS";delivery_idempotency_key?:string;
}
export interface RunState {
 contract_version:"2.2";run_id:string;case:RawCase;input:AgentInput;now:string;applied:Source[];
 current_status:"NEW"|"WAITING_FOR_BUYER"|"COMPLETED";question_wait_state:Question|null;
 initial_assessment:Assessment|null;initial_policy_output:PolicyOutput|null;
 after_reply_assessment:Assessment|null;after_reply_policy_output:PolicyOutput|null;
 final_assessment_source:1|2|null;final_assessment:Assessment|null;final_policy_output:PolicyOutput|null;
 final_event:{event_id:string;text?:string;type:"BUYER_REPLY"|"USER_NO_REPLY"}|null;
 pending_event?:{event_id:string;text:string;type:"BUYER_REPLY";question_id:string}|null;
 agent_session_id?:string|null;agent_session_status?:"CREATING"|"ACTIVE"|"IDLE"|"FAILED"|"RECOVERY_REQUIRED";
 agent_environment_id?:string|null;agent_turn_id?:string|null;agent_tool_ledger?:AgentToolLedgerEntry[];
 requested_question?:{question_key:NonNullable<Assessment["question_key"]>;question_text:string}|null;
 agent_remote_cancel_status?:"NOT_REQUESTED"|"ACCEPTED"|"AMBIGUOUS"|"UNAVAILABLE";
}
export interface PipelineState {
 run:RunState;mode:"REPLAY"|"LIVE_AI";stage:"INITIAL"|"AFTER_REPLY";trigger:string;
 snapshot:any;source_index:Record<string,Source>;assessment:Assessment|null;confidence_score?:ConfidenceScore;
 result:PolicyOutput|null;rules:string[];issues:string[];model_info:Record<string,any>;
 halted:boolean;trace:string[];decision:Decision|null;execution_id:string;
 agent_session_id?:string|null;agent_turn_id?:string|null;agent_environment_id?:string|null;
 agent_decisions?:{snapshot_hash:string;evidence_hash:string;action_input_hash:string;hypothesis:HypothesisDecisionRef;action:ActionDecision;buyer_facts:BuyerInterpretation;missing_info:Assessment["missing_info"]};
 semantic_facts?:BuyerInterpretation;
 requested_question?:{question_key:NonNullable<Assessment["question_key"]>;question_text:string}|null;
 policy_checked?:boolean;
 agent_execution?:{model:string;session_id:string;turn_id:string|null;environment_id:string|null;tool_calls:Array<{name:string;call_id?:string;turn_id?:string}>;event_ids:string[];usage:unknown;decision_requests:number;skill_names:string[];status:"COMPLETED"|"FAILED";failure_category?:DecisionFailureCategory;clarification_repair?:{status:"FAILED";category:string}};
 agent_tool_ledger?:AgentToolLedgerEntry[];
 signal?:AbortSignal;
 remoteCancelStatus?:"NOT_REQUESTED"|"ACCEPTED"|"AMBIGUOUS"|"UNAVAILABLE";
}
export const ms=(value:string)=>Date.parse(value);
export const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase();
export const policyOnly=(d:PolicyOutput):PolicyOutput=>({eligibility:d.eligibility,policy_gate:d.policy_gate,final_action:d.final_action,reason:d.reason});
export function stop(s:PipelineState,rule:string,reason:string,eligibility:PolicyOutput["eligibility"]="UNKNOWN",gate:PolicyOutput["policy_gate"]="ESCALATED") {
 s.halted=true;s.rules.push(rule);s.result={eligibility,policy_gate:gate,final_action:"ESCALATE_REVIEW",reason};
}
export const QUESTIONS={
 CONFIRM_INTENT:"Bạn còn muốn nhận đơn tại địa điểm đã đăng ký không, và khi nào có người có thể nhận? Nếu có trở ngại về liên hệ hoặc COD, bạn vui lòng làm rõ.",
 CLARIFY_LANDMARK:"Bạn có thể bổ sung mốc dễ tìm trong địa điểm đã đăng ký, xác nhận còn muốn nhận và khi nào có người nhận không?",
};

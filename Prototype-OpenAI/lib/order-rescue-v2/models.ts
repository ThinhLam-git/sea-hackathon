import { z } from "zod";
import type { AgentInput, ConfidenceScore, Source } from "../order-rescue/models";
import type { BuyerInterpretation } from "./agents/business-facts";
import type { ActionDecision, HypothesisDecisionRef } from "./agents/decisions";
export type { AgentInput, ConfidenceScore, Source };
export const CONTRACT_VERSION="2.2";
export const POLICY_VERSION="demo-two-assessment-v2";
export const HYPOTHESES=["AVAILABILITY_ISSUE","ADDRESS_ISSUE","CONTACT_ISSUE","BUYER_INTENT_ISSUE","PAYMENT_ISSUE","LOGISTICS_ISSUE","UNKNOWN_CAUSE"] as const;
export const MISSING=["CURRENT_BUYER_INTENT","RECEIVING_AVAILABILITY","ADDRESS_CLARIFICATION","CONTACT_CLARIFICATION","COD_READINESS","DELIVERY_ACCESS","LOGISTICS_VERIFICATION","CAUSE_CLARIFICATION"] as const;
export const Assessment=z.object({
 evidence:z.array(z.object({source_ref:z.string().min(1),fact:z.string().min(1),verification:z.enum(["SOURCE_RECORD","UNVERIFIED_REPORT","DIRECT_BUYER_STATEMENT","VERIFIED_OPS_SIGNAL"])}).strict()).min(1),
 hypothesis:z.enum(HYPOTHESES),confidence:z.enum(["LOW","MEDIUM","HIGH"]),
 missing_info:z.array(z.enum(MISSING)).refine(a=>new Set(a).size===a.length,"Duplicate missing-info codes"),
 question_key:z.enum(["CONFIRM_INTENT","CLARIFY_LANDMARK"]).nullable(),
 candidate_action:z.enum(["CLARIFY","STANDARD_REATTEMPT","HOLD_DISRUPTION","ESCALATE_REVIEW","NO_ACTION"]),
}).strict();
export type Assessment=z.infer<typeof Assessment>;
export interface PolicyOutput {eligibility:"ELIGIBLE"|"INELIGIBLE"|"UNKNOWN";policy_gate:"PERMITTED"|"BLOCKED"|"ESCALATED";final_action:Assessment["candidate_action"];reason:string}
export interface RawCase {case_id:string;input:AgentInput;sources:Source[]}
export interface Question {question_id:string;question_key:NonNullable<Assessment["question_key"]>;question_text:string;status:"PENDING"|"ANSWERED"|"NO_REPLY";asked_at:string}
export interface Decision extends PolicyOutput {
 decision_id:string;run_id:string;case_id:string;trigger:string;decided_at:string;record_status:"PENDING"|"FINAL";
 agent:Assessment|null;confidence_score?:ConfidenceScore;question_text:string|null;rules:string[];validation_issues:string[];
 skills_run:string[];model_info:Record<string,any>;policy_version:string;snapshot_source_refs:string[];
 workflow_execution_id:string;reassess_at:null;labels:string[];
}
export interface AgentToolLedgerEntry {
 tool_id:string;external_call_id:string|null;session_id:string|null;turn_id?:string|null;phase:"INITIAL"|"AFTER_REPLY";
 tool_name:string;status:"COMPLETED";result:unknown;started_at:string;completed_at:string;latency_ms:number;decision_ids:string[];
}
export interface RunState {
 contract_version:"2.2";run_id:string;case:RawCase;input:AgentInput;now:string;applied:Source[];
 current_status:"NEW"|"WAITING_FOR_BUYER"|"COMPLETED";question_wait_state:Question|null;
 initial_assessment:Assessment|null;initial_policy_output:PolicyOutput|null;
 after_reply_assessment:Assessment|null;after_reply_policy_output:PolicyOutput|null;
 final_assessment_source:1|2|null;final_assessment:Assessment|null;final_policy_output:PolicyOutput|null;
 final_event:{event_id:string;text?:string;type:"BUYER_REPLY"|"USER_NO_REPLY"}|null;
 pending_event?:{event_id:string;text:string;type:"BUYER_REPLY";question_id:string}|null;
 agent_session_id?:string|null;agent_session_status?:"CREATING"|"ACTIVE"|"IDLE"|"FAILED";
 agent_environment_id?:string|null;agent_turn_id?:string|null;agent_tool_ledger?:AgentToolLedgerEntry[];
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
 agent_execution?:{model:string;session_id:string;turn_id:string|null;environment_id:string|null;tool_calls:Array<{name:string;call_id?:string;turn_id?:string}>;event_ids:string[];usage:unknown;decision_requests:number;skill_names:string[];status:"COMPLETED"|"FAILED"};
 agent_tool_ledger?:AgentToolLedgerEntry[];
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

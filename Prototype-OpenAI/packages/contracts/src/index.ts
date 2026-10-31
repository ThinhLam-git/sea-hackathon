import { z } from "zod";

export const CONTRACT_VERSION = "2.2" as const;
export const POLICY_VERSION = "demo-two-assessment-v2" as const;
export const HYPOTHESES = ["AVAILABILITY_ISSUE", "ADDRESS_ISSUE", "CONTACT_ISSUE", "BUYER_INTENT_ISSUE", "PAYMENT_ISSUE", "LOGISTICS_ISSUE", "UNKNOWN_CAUSE"] as const;
export const MISSING = ["CURRENT_BUYER_INTENT", "RECEIVING_AVAILABILITY", "ADDRESS_CLARIFICATION", "CONTACT_CLARIFICATION", "COD_READINESS", "DELIVERY_ACCESS", "LOGISTICS_VERIFICATION", "CAUSE_CLARIFICATION"] as const;

export const AssessmentSchema = z.object({
  evidence: z.array(z.object({ source_ref: z.string().min(1), fact: z.string().min(1), verification: z.enum(["SOURCE_RECORD", "UNVERIFIED_REPORT", "DIRECT_BUYER_STATEMENT", "VERIFIED_OPS_SIGNAL"]) }).strict()).min(1),
  hypothesis: z.enum(HYPOTHESES), confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  missing_info: z.array(z.enum(MISSING)).refine((items) => new Set(items).size === items.length, "Duplicate missing-info codes"),
  question_key: z.enum(["CONFIRM_INTENT", "CLARIFY_LANDMARK"]).nullable(),
  candidate_action: z.enum(["CLARIFY", "STANDARD_REATTEMPT", "HOLD_DISRUPTION", "ESCALATE_REVIEW", "NO_ACTION"]),
}).strict();
export type Assessment = z.infer<typeof AssessmentSchema>;

/** Browser-safe source DTO. Never contains credentials or evaluator labels. */
export interface Source {
  source_ref: string;
  phase: "T0" | "RUNTIME";
  source_type: string;
  actor: string;
  occurred_at: string;
  content: any;
}

/** The seven-field projection supplied to assessment. */
export interface AgentInput {
  case_id: string;
  failed_event: Record<string, any>;
  attempts_used: number;
  return_state: "NOT_STARTED" | "STARTED" | "COMPLETED" | "UNKNOWN";
  deadline: string | null;
  buyer_history: Record<string, any>[];
  operational_context: Record<string, any>;
}

export interface ConfidenceScore {
  source: "openai_decisions";
  model: string;
  rubric_version: string;
  score: number;
  latency_ms?: number;
  raw_score: number;
  rubric_score: number;
  level: Assessment["confidence"];
  scorer_confidence: number;
  probabilities: { value: number; label: string; probability: number }[];
  capped: boolean;
  cap_reason?: string;
}

export interface PolicyOutput {
  eligibility: "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN";
  policy_gate: "PERMITTED" | "BLOCKED" | "ESCALATED";
  final_action: Assessment["candidate_action"];
  reason: string;
}

export interface RawCase { case_id: string; input: AgentInput; sources: Source[] }
export interface Question {
  question_id: string;
  question_key: NonNullable<Assessment["question_key"]>;
  question_text: string;
  status: "PENDING" | "ANSWERED" | "NO_REPLY";
  asked_at: string;
}

export interface Decision extends PolicyOutput {
  decision_id: string; run_id: string; case_id: string; trigger: string; decided_at: string;
  record_status: "PENDING" | "FINAL"; agent: Assessment | null; confidence_score?: ConfidenceScore;
  question_text: string | null; rules: string[]; validation_issues: string[]; skills_run: string[];
  model_info: Record<string, any>; policy_version: string; snapshot_source_refs: string[];
  workflow_execution_id: string; reassess_at: null; labels: string[];
}

export interface PublicRunView {
  run_id: string; case_id: string; title: string; group: string; mode: "REPLAY" | "LIVE_AI"; now: string;
  input: AgentInput; limits: { max_attempts: number; max_questions: number }; contract_version: "2.2";
  lifecycle: "NEW" | "WAITING_FOR_BUYER" | "COMPLETED";
  question: { asked: number; key: string | null; question_id: string | null; deadline: null; replied: boolean; timed_out: false; no_reply: boolean };
  sources: Source[];
  events: Array<{ source_ref: string; type: string; text?: string; occurred_at: string; applied: boolean; available: boolean }>;
  sample_reply_available: boolean;
  pipeline: Array<{ name: string; purpose: string }>;
  history: Array<Omit<Decision, "agent"> & { agent: (Omit<Assessment, "evidence"> & { evidence: Array<Assessment["evidence"][number] & { verified: boolean; quote: string }> }) | null }>;
  /** Compatibility slots remain present but evaluator-only values are never returned to clients. */
  golden: [];
  expected: null;
  assessment_slots: { initial: Assessment | null; after_reply: Assessment | null; final: Assessment | null; selected: 1 | 2 | null };
  policy_slots: { initial: PolicyOutput | null; after_reply: PolicyOutput | null; final: PolicyOutput | null };
  ground_truth_status: "DRAFT_NEEDS_USER_REVIEW";
  final_event: { event_id: string; text?: string; type: "BUYER_REPLY" | "USER_NO_REPLY" } | null;
}

export function sourceText(source: Source): string {
  if (source.content && typeof source.content === "object" && "text" in source.content) return String(source.content.text);
  if (typeof source.content === "string") return source.content;
  return JSON.stringify(source.content);
}

\n
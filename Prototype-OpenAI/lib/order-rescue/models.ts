/**
 * Shared types, following the v0.5 sheet contract:
 * 7 Agent Input fields, 6 Agent Output fields, 4 Final Policy Output fields.
 * Times are ISO strings so workflow state stays plain JSON. Everything here is demo data.
 */
import { z } from "zod";

export const LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

export const Assessment = z.object({
  evidence: z.array(z.object({
    source_ref: z.string(),
    fact: z.string(),
    quote: z.string(),
    verified: z.boolean(),
  })),
  hypothesis: z.enum(["TEMP_AVAILABILITY_CONFLICT", "UNCLEAR_LANDMARK", "UNVERIFIED_REFUSAL",
    "PAYMENT_NOT_READY", "SERVICE_DISRUPTION", "UNKNOWN_CAUSE"]),
  confidence: z.enum(LEVELS),
  missing_info: z.array(z.string()),
  question_key: z.enum(["CONFIRM_INTENT", "CLARIFY_LANDMARK"]).nullable(),
  candidate_action: z.enum(["CLARIFY", "STANDARD_REATTEMPT", "HOLD_DISRUPTION", "ESCALATE_REVIEW", "NO_ACTION"]),
  buyer_intent: z.enum(["WANTS", "DECLINES", "UNKNOWN"]),
  availability: z.enum(["CONFIRMED", "ONLY_AFTER_DEADLINE", "UNKNOWN"]),
  location_clarified: z.boolean(),
  address_change_needed: z.boolean(),
  sources_conflict: z.boolean(),
  explanation: z.string(),
});
export type Assessment = z.infer<typeof Assessment>;

/** One raw source row (sheet 04). Not evidence: the agent builds evidence from these. */
export interface Source {
  source_ref: string;
  phase: "T0" | "RUNTIME";
  source_type: string;
  actor: string;
  occurred_at: string;
  content: any;
}

/** The 7 Agent Input fields. */
export interface AgentInput {
  case_id: string;
  failed_event: Record<string, any>;
  attempts_used: number;
  return_state: "NOT_STARTED" | "STARTED" | "COMPLETED" | "UNKNOWN";
  deadline: string | null;
  buyer_history: Record<string, any>[];
  operational_context: Record<string, any>;
}

export interface CaseFile {
  case_id: string;
  group: string;   // presenter-only
  title: string;   // presenter-only
  input: AgentInput;
  sources: Source[];
  expected: any;   // golden answer, tests/UI only, never sent to the model
}

/** Mutable per-run case state. Only the simulator mutates it. */
export interface RunState {
  run_id: string;
  case: CaseFile;
  input: AgentInput;
  now: string;
  applied: Source[];
  questions_asked: number;
  question_key: string | null;
  question_deadline: string | null;
  replied_after_question: boolean;
  timeout_fired: boolean;
}

export type RecordStatus = "PENDING" | "FINAL" | "NO_CHANGE";

export interface PolicyResult {
  eligibility: "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN" | null;
  policy_gate: "PERMITTED" | "BLOCKED" | "ESCALATED" | null;
  final_action: string | null;
  rules: string[];
  record_status: RecordStatus;
  reassess_at: string | null;
}

export interface Decision {
  decision_id: string;
  run_id: string;
  case_id: string;
  trigger: string;
  decided_at: string;
  record_status: RecordStatus;
  eligibility: string | null;
  policy_gate: string | null;
  final_action: string | null;
  reason: string;
  headline: string;
  rules: string[];
  agent: Assessment | null;
  question_text: string | null;
  reassess_at: string | null;
  validation_issues: string[];
  skills_run: string[];
  model_info: Record<string, any>;
  workflow_execution_id?: string;
  snapshot_source_refs?: string[];
  policy_version: string;
  labels: string[];
}

export interface PipelineState {
  run: RunState;
  policy: any;
  mode: "REPLAY" | "LIVE_AI";
  trigger: string;
  replay_key: string;
  replay_store: Record<string, any>;
  snapshot: any;
  source_index: Record<string, Source>;
  assessment: Assessment | null;
  model_info: Record<string, any>;
  validation_issues: string[];
  result: PolicyResult | null;
  decision: Decision | null;
  halted: boolean;
  trace: string[];
}

export interface Skill {
  RUNS_WHEN_HALTED: boolean;
  run: (state: PipelineState) => PipelineState | Promise<PipelineState>;
}

export const ms = (iso: string) => Date.parse(iso);

export function minLevel(a: Assessment["confidence"], b: Assessment["confidence"]) {
  return LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b;
}

export function sourceText(s: Source): string {
  if (s.content && typeof s.content === "object" && "text" in s.content) return String(s.content.text);
  if (typeof s.content === "string") return s.content;
  return JSON.stringify(s.content);
}

/** End the AI path and hand the case to Ops with a rule reason. */
export function stop(state: PipelineState, rule: string, gate: PolicyResult["policy_gate"] = "ESCALATED",
                     eligibility?: PolicyResult["eligibility"], record: RecordStatus = "FINAL") {
  state.result ??= { eligibility: null, policy_gate: null, final_action: null, rules: [], record_status: "FINAL", reassess_at: null };
  if (eligibility) state.result.eligibility = eligibility;
  state.result.policy_gate = gate;
  state.result.final_action = gate ? "ESCALATE_REVIEW" : null;
  state.result.record_status = record;
  state.result.rules.push(rule);
  state.halted = true;
}

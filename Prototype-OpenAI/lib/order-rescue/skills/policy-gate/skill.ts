import { ms, type PipelineState, type PolicyResult } from "../../models.js";
import { check } from "../load-case/skill.js";

export const RUNS_WHEN_HALTED = true;

/** NONE, ACTIVE (verified, matches route/time), RESOLVED, or UNVERIFIED (anything else). */
export function disruptionStatus(state: PipelineState): [string, string | null] {
  const input = state.run.input;
  const d = input.operational_context.disruption;
  if (!d) return ["NONE", null];
  if (state.run.applied.some((s) => s.source_type === "DISRUPTION_RESOLVED")) return ["RESOLVED", null];
  const matches = d.verification === "VERIFIED" && d.status === "ACTIVE"
    && d.scope_route_token === input.operational_context.route
    && d.started_at && ms(d.started_at) <= ms(input.failed_event.time);
  return matches ? ["ACTIVE", d.reassess_at ?? null] : ["UNVERIFIED", null];
}

function waitingForReply(state: PipelineState): boolean {
  const r = state.run;
  return r.questions_asked > 0 && !r.replied_after_question && !r.timeout_fired
    && r.question_deadline !== null && ms(r.now) < ms(r.question_deadline);
}

function decide(res: PolicyResult, gate: PolicyResult["policy_gate"], action: string, rules: string[],
                record: PolicyResult["record_status"] = "FINAL", reassessAt: string | null = null) {
  Object.assign(res, { policy_gate: gate, final_action: action, record_status: record, reassess_at: reassessAt });
  res.rules.push(...rules);
}

export function run(state: PipelineState): PipelineState {
  const r = state.run, res = state.result!;
  const timedOut = r.timeout_fired && !r.replied_after_question;

  if (state.halted) {
    if (timedOut && res.eligibility === "ELIGIBLE" && res.record_status === "FINAL" && !res.rules.includes("R13")) res.rules.push("R13");
    return state;
  }

  // 1. Latest state.
  check(state);
  if (state.halted) return state;

  // 2. Escalation rules.
  const a = state.assessment!;
  const [status, reassessAt] = disruptionStatus(state);
  const escalate = ([
    ["R06", a.address_change_needed],
    ["R08", a.hypothesis === "UNVERIFIED_REFUSAL"],
    ["R09", a.sources_conflict],
    ["R03", a.availability === "ONLY_AFTER_DEADLINE"],
    ["R13", timedOut],
    ["R10", a.hypothesis === "SERVICE_DISRUPTION" && (status === "NONE" || status === "UNVERIFIED")],
  ] as [string, boolean][]).filter(([, hit]) => hit).map(([rule]) => rule);
  if (escalate.length) {
    decide(res, "ESCALATED", "ESCALATE_REVIEW", escalate);
    return state;
  }

  // 3. Candidate action.
  switch (a.candidate_action) {
    case "CLARIFY":
      if (r.questions_asked >= state.policy.max_buyer_questions) {
        if (waitingForReply(state)) decide(res, "PERMITTED", "NO_ACTION", ["WAIT"], "PENDING", r.question_deadline);
        else decide(res, "ESCALATED", "ESCALATE_REVIEW", ["R12"]);
      } else if (!a.question_key || !(a.question_key in state.policy.question_templates)) {
        decide(res, "ESCALATED", "ESCALATE_REVIEW", ["R12"]);
      } else {
        decide(res, "PERMITTED", "CLARIFY", ["R12"], "PENDING");
      }
      break;
    case "STANDARD_REATTEMPT": {
      const missing = ([
        ["intent", a.buyer_intent !== "WANTS"],
        ["availability", a.availability !== "CONFIRMED"],
        ["location", a.hypothesis === "UNCLEAR_LANDMARK" && !a.location_clarified],
        ["disruption", status === "ACTIVE"],
      ] as [string, boolean][]).filter(([, hit]) => hit).map(([m]) => `R05:${m}`);
      if (missing.length) decide(res, "ESCALATED", "ESCALATE_REVIEW", missing);
      else decide(res, "PERMITTED", "STANDARD_REATTEMPT", ["R05"]);
      break;
    }
    case "HOLD_DISRUPTION":
      if (status === "ACTIVE" && reassessAt) decide(res, "PERMITTED", "HOLD_DISRUPTION", ["R10"], "PENDING", reassessAt);
      else decide(res, "ESCALATED", "ESCALATE_REVIEW", ["R10"]);
      break;
    case "NO_ACTION":
      if (waitingForReply(state)) decide(res, "PERMITTED", "NO_ACTION", ["WAIT"], "PENDING", r.question_deadline);
      else decide(res, "ESCALATED", "ESCALATE_REVIEW", ["R12"]);
      break;
    default:
      decide(res, "ESCALATED", "ESCALATE_REVIEW", ["AGENT_ESCALATE"]);
  }
  return state;
}

import { ms, stop, type PipelineState } from "../../models.js";

export const RUNS_WHEN_HALTED = false;

/** Stops the case if it is not eligible for AI assessment. Safe to call again on the latest state. */
export function check(state: PipelineState): void {
  const { input, now } = state.run;
  const ctx = input.operational_context;

  if (ctx.duplicate_trigger || ctx.latest_status === "DELIVERED") return stop(state, "R20", null, null, "NO_CHANGE");
  if (ctx.pii_quarantined) return stop(state, "R15", "BLOCKED", "UNKNOWN");
  if (input.return_state === "STARTED" || input.return_state === "COMPLETED") return stop(state, "R01", "BLOCKED", "INELIGIBLE");
  if (input.return_state === "UNKNOWN" || input.deadline === null) return stop(state, "R02", "ESCALATED", "UNKNOWN");
  if (ms(now) >= ms(input.deadline)) return stop(state, "R03", "BLOCKED", "INELIGIBLE");
  if (input.attempts_used >= state.policy.max_attempts) return stop(state, "R04", "BLOCKED", "INELIGIBLE");

  state.result!.eligibility = "ELIGIBLE";
  if (ctx.untrusted_note_flag) return stop(state, "R19");
  if (ctx.request_actor_role === "SELLER") return stop(state, "R21");
  if (ctx.recipient_detail_requires_ops_verification) {
    if (state.run.applied.some((s) => s.source_type === "SELLER_REPLY")) state.result!.rules.push("R21");
    return stop(state, "R22");
  }
}

export function run(state: PipelineState): PipelineState {
  state.result = { eligibility: null, policy_gate: null, final_action: null, rules: [], record_status: "FINAL", reassess_at: null };
  check(state);
  return state;
}

import type { PipelineState } from "../../models.js";

export const RUNS_WHEN_HALTED = false;

export function run(state: PipelineState): PipelineState {
  const r = state.run;
  const sources = [...r.case.sources.filter((s) => s.phase === "T0"), ...r.applied];
  state.source_index = Object.fromEntries(sources.map((s) => [s.source_ref, s]));
  state.snapshot = {
    now: r.now,
    policy_version: state.policy.policy_version,
    agent_input: r.input,
    sources: sources.map(({ phase, ...rest }) => rest),
    question_state: {
      questions_asked: r.questions_asked,
      max_questions: state.policy.max_buyer_questions,
      question_key: r.question_key,
      reply_deadline: r.question_deadline,
      buyer_replied: r.replied_after_question,
      timed_out: r.timeout_fired,
    },
    approved_questions: Object.keys(state.policy.question_templates),
  };
  return state;
}

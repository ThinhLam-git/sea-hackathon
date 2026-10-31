import { describe, expect, it } from "vitest";
import { run as compose } from "../packages/agent/src/skills/compose-recommendation/skill";

function clarifyState(requestedQuestion?: { question_key: "CONFIRM_INTENT"; question_text: string }) {
  return {
    run: {
      run_id: "run_clarify",
      case: { case_id: "DEMO-005" },
      now: "2026-10-31T09:00:00.000Z",
    },
    mode: "LIVE_AI",
    stage: "INITIAL",
    trigger: "START",
    assessment: {
      evidence: [{ source_ref: "DEMO-005-EV1", fact: "A delivery attempt failed.", verification: "SOURCE_RECORD" }],
      hypothesis: "UNKNOWN_CAUSE",
      confidence: "LOW",
      missing_info: ["CURRENT_BUYER_INTENT"],
      question_key: "CONFIRM_INTENT",
      candidate_action: "CLARIFY",
    },
    result: { eligibility: "ELIGIBLE", policy_gate: "PERMITTED", final_action: "CLARIFY", reason: "One question is available." },
    requested_question: requestedQuestion,
    rules: ["ONE_QUESTION"],
    issues: [],
    model_info: {},
    trace: ["load-case", "prepare-input", "assess-case", "validate-output", "policy-gate"],
    source_index: { "DEMO-005-EV1": {} },
    execution_id: "exec_clarify",
    confidence_score: undefined,
  } as any;
}

describe("initial clarification persistence", () => {
  it("turns an unasked CLARIFY into an explicit review instead of normal success", () => {
    const state = clarifyState();
    compose(state);
    expect(state.decision).toMatchObject({
      final_action: "ESCALATE_REVIEW",
      policy_gate: "ESCALATED",
      record_status: "FINAL",
      question_text: null,
    });
    expect(state.decision.reason).toMatch(/question.*saved|saved.*question/i);
    expect(state.decision.rules).toContain("CLARIFICATION_NOT_SAVED");
  });

  it("keeps a saved clarification pending with its exact copyable text", () => {
    const question = { question_key: "CONFIRM_INTENT" as const, question_text: "Do you still want the parcel?" };
    const state = clarifyState(question);
    compose(state);
    expect(state.decision).toMatchObject({ final_action: "CLARIFY", record_status: "PENDING", question_text: question.question_text });
  });
});

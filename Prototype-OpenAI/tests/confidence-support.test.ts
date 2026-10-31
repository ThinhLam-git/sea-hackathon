import { describe, expect, it } from "vitest";
import { run as validate } from "../packages/agent/src/skills/validate-output/skill";

function stateFor(hypothesis: string, confidence = "HIGH") {
  return {
    run: { question_wait_state: null }, mode: "LIVE_AI", stage: "INITIAL", snapshot: {}, source_index: { "BUYER-REPLY": { source_ref: "BUYER-REPLY", source_type: "BUYER_REPLY", content: { text: "I still want the parcel." } } },
    assessment: { evidence: [{ source_ref: "BUYER-REPLY", fact: "I still want the parcel.", verification: "DIRECT_BUYER_STATEMENT" }], hypothesis, confidence,
      missing_info: [], question_key: null, candidate_action: "ESCALATE_REVIEW" },
    confidence_score: { source: "openai_decisions", model: "gpt-6-luna", rubric_version: "evidence-support-v2.2", score: 91, raw_score: 91, rubric_score: 2,
      level: "LOW", scorer_confidence: 0.93, probabilities: [{ value: 0, label: "LOW", probability: 1 }], capped: false },
    result: null, rules: [], issues: [], model_info: {}, halted: false, trace: [], decision: null, execution_id: "exec",
  } as any;
}

describe("evidence-support confidence boundary", () => {
  it("does not treat an intent-only buyer quote as high cause confidence", () => {
    const state=stateFor("AVAILABILITY_ISSUE");
    validate(state);
    expect(state.assessment.confidence).toBe("LOW");
    expect(state.confidence_score.raw_score).toBe(91);
    expect(state.confidence_score.score).toBe(24);
    expect(state.confidence_score.cap_reason).toBe("evidence_support_band");
  });

  it("caps unknown cause at LOW while retaining the unadjusted score", () => {
    const state=stateFor("UNKNOWN_CAUSE"); state.confidence_score.level="HIGH"; state.assessment.confidence="HIGH";
    validate(state);
    expect(state.assessment.confidence).toBe("LOW");
    expect(state.confidence_score.raw_score).toBe(91);
    expect(state.confidence_score.score).toBe(24);
    expect(state.confidence_score.cap_reason).toBe("unknown_cause");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { Decisions } from "openai/resources/decisions";
import { evaluateActionDecision, evaluateHypothesisDecision, parseChoiceDecision } from "../packages/agent/src/decisions";
import { HYPOTHESES } from "../packages/agent/src/models";

const labels = ["H1", "H2", "UNKNOWN"] as const;
const response = {
  model: "gpt-6-luna",
  answers: [{ type: "choice", name: "hypothesis", choice: "H1", confidence: 0.81, probabilities: [
    { value: "H1", probability: 0.7 }, { value: "H2", probability: 0.2 }, { value: "UNKNOWN", probability: 0.1 },
  ] }],
};
afterEach(() => vi.restoreAllMocks());

describe("Decisions choice results", () => {
  it("preserves the complete option distribution and API confidence separately", () => {
    expect(parseChoiceDecision(response, "hypothesis", labels)).toEqual({
      selected: "H1", probabilities: response.answers[0].probabilities, api_confidence: 0.81,
    });
  });

  it("rejects incomplete, duplicated, or invalid probability distributions", () => {
    const missing = structuredClone(response); missing.answers[0].probabilities.pop();
    const duplicate = structuredClone(response); duplicate.answers[0].probabilities[1].value = "H1";
    const invalidMass = structuredClone(response); invalidMass.answers[0].probabilities[2].probability = 0.4;
    expect(() => parseChoiceDecision(missing, "hypothesis", labels)).toThrow("invalid_decisions_output");
    expect(() => parseChoiceDecision(duplicate, "hypothesis", labels)).toThrow("invalid_decisions_output");
    expect(() => parseChoiceDecision(invalidMass, "hypothesis", labels)).toThrow("invalid_decisions_output");
  });

  it("fails closed on refusal or a label outside the BI vocabulary", () => {
    expect(() => parseChoiceDecision({ answers: [{ type: "refusal", name: "hypothesis" }] }, "hypothesis", labels)).toThrow("decisions_refused");
    const unknown = structuredClone(response); unknown.answers[0].choice = "OTHER";
    expect(() => parseChoiceDecision(unknown, "hypothesis", labels)).toThrow("invalid_decisions_output");
  });

  it("makes one Decisions request with the current semantic facts and preserves its response metadata", async () => {
    const answer = { type: "choice", name: "candidate_action", choice: "ESCALATE_REVIEW", confidence: 0.77,
      probabilities: ["CLARIFY", "STANDARD_REATTEMPT", "HOLD_DISRUPTION", "ESCALATE_REVIEW", "NO_ACTION"].map((value) => ({ value, probability: value === "ESCALATE_REVIEW" ? 0.7 : 0.075 })) };
    const scorer = vi.spyOn(Decisions.prototype, "create").mockResolvedValue({ model: "gpt-6-luna", answers: [answer] } as any);
    const client = new OpenAI({ apiKey: "test-key", maxRetries: 0 });
    const context = {
      snapshot: { case_id: "SYNTHETIC-1", buyer_reply: "I still want it, but nobody can receive it tomorrow." },
      evidence: [{ source_ref: "BUYER-1", fact: "Buyer wants the parcel but availability is uncertain.", verification: "DIRECT_BUYER_STATEMENT" }],
      hypothesis: { decision_id: "hyp-1", selected: "AVAILABILITY_ISSUE", probabilities: [], api_confidence: 0.8 },
      buyer_facts: { intent: "YES", availability: "CONDITIONAL", cod_readiness: "UNKNOWN", address_change: "NO", after_deadline: "UNKNOWN" },
      missing_info: ["RECEIVING_AVAILABILITY"], phase: "AFTER_REPLY",
    } as any;
    const result = await evaluateActionDecision(client, context);
    expect(scorer).toHaveBeenCalledTimes(1);
    expect(scorer.mock.calls[0][0]).toMatchObject({ model: "gpt-6-luna", questions: [{ type: "choice", name: "candidate_action" }] });
    const sent = JSON.stringify(scorer.mock.calls[0][0].input);
    expect(sent).toContain("CONDITIONAL"); expect(sent).toContain("hyp-1"); expect(sent).not.toContain("expected");
    expect(result).toMatchObject({ selected: "ESCALATE_REVIEW", api_confidence: 0.77, probabilities: answer.probabilities });
  });

  it("selects a cause, then scores evidence support in a separate Decisions request", async () => {
    const choice = { model: "gpt-6-luna", answers: [{ type: "choice", name: "hypothesis", choice: "CONTACT_ISSUE", confidence: 0.68,
      probabilities: HYPOTHESES.map((value) => ({ value, probability: value === "CONTACT_ISSUE" ? 0.7 : 0.05 })) }] };
    const support = { model: "gpt-6-luna", answers: [{ type: "score", name: "evidence_support", score: 1, confidence: 0.82,
      probabilities: [{ value: 0, label: "LOW", probability: 0.1 }, { value: 1, label: "MEDIUM", probability: 0.8 }, { value: 2, label: "HIGH", probability: 0.1 }] }] };
    const scorer = vi.spyOn(Decisions.prototype, "create").mockResolvedValueOnce(choice as any).mockResolvedValueOnce(support as any);
    const result = await evaluateHypothesisDecision(new OpenAI({ apiKey: "test-key", maxRetries: 0 }), {
      snapshot: { core_input: { case_id: "SYNTHETIC-2" }, runtime_context: [] },
      evidence: [{ source_ref: "SOURCE-1", fact: "Courier reports no contact.", verification: "UNVERIFIED_REPORT" }],
    } as any);
    expect(scorer).toHaveBeenCalledTimes(2);
    expect(scorer.mock.calls[0][0].questions).toEqual([expect.objectContaining({ type: "choice", name: "hypothesis" })]);
    expect(scorer.mock.calls[1][0].questions).toEqual([expect.objectContaining({ type: "score", name: "evidence_support" })]);
    expect(result).toMatchObject({ selected: "CONTACT_ISSUE", api_confidence: 0.68, evidence_support: { scorer_confidence: 0.82 } });
    expect(result.probabilities).toHaveLength(7);
  });
});

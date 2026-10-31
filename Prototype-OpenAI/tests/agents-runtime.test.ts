import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { Decisions } from "openai/resources/decisions";
import { runAgentAssessment } from "../packages/agent/src/runtime/agent-runtime";
import * as prepareInput from "../packages/agent/src/skills/prepare-input/skill";
import { loadCase } from "../apps/web/lib/application/v2-workflow-data";
import { Assessment, HYPOTHESES, type PipelineState } from "../packages/agent/src/models";

afterEach(() => vi.restoreAllMocks());

function stream() {
  const events = [
    { type: "agent.session.created", event_id: "created", session: { id: "sess_test", environment: { id: "env_test" } } },
    { type: "agent.session.turn.completed", event_id: "complete", turn: { id: "turn_test" }, usage: null },
  ];
  return Object.assign((async function* () { yield* events; })(), {
    withResultCollection() { return this; },
    async finalResult() { return { session_id: "sess_test", turn_id: "turn_test", output_text: "Submitted the assessment." }; },
  });
}

describe("Agents API assessment tool chain", () => {
  it("uses recorded Decisions labels instead of values repeated by the agent at commit", async () => {
    const cause = { model: "gpt-6-luna", answers: [{ type: "choice", name: "hypothesis", choice: "CONTACT_ISSUE", confidence: 0.72,
      probabilities: HYPOTHESES.map((value) => ({ value, probability: value === "CONTACT_ISSUE" ? 0.7 : 0.05 })) }] };
    const support = { model: "gpt-6-luna", answers: [{ type: "score", name: "evidence_support", score: 1, confidence: 0.8,
      probabilities: [{ value: 0, label: "LOW", probability: 0.1 }, { value: 1, label: "MEDIUM", probability: 0.8 }, { value: 2, label: "HIGH", probability: 0.1 }] }] };
    const actionLabels = ["CLARIFY", "STANDARD_REATTEMPT", "HOLD_DISRUPTION", "ESCALATE_REVIEW", "NO_ACTION"];
    const action = { model: "gpt-6-luna", answers: [{ type: "choice", name: "candidate_action", choice: "CLARIFY", confidence: 0.7,
      probabilities: actionLabels.map((value) => ({ value, probability: value === "CLARIFY" ? 0.6 : 0.1 })) }] };
    const decisions = vi.spyOn(Decisions.prototype, "create").mockResolvedValueOnce(cause as any).mockResolvedValueOnce(support as any).mockResolvedValueOnce(action as any);
    const raw = loadCase("DEMO-001");
    const state = {
      run: { run_id: "run_test", case: raw, input: raw.input, now: "2026-10-31T09:00:00Z", applied: [], question_wait_state: null },
      mode: "LIVE_AI", stage: "INITIAL", trigger: "START", snapshot: null, source_index: {}, assessment: null,
      result: null, rules: [], issues: [], model_info: {}, halted: false, trace: [], decision: null, execution_id: "exec_test",
    } as unknown as PipelineState;
    const evidence = [{ source_ref: raw.sources.find((source) => source.source_type === "FAILED_DELIVERY")!.source_ref, fact: "A failed delivery attempt was recorded.", verification: "SOURCE_RECORD" }];
    prepareInput.run(state);
    let submitted: unknown;
    const sessions = {
      create: vi.fn(async (body: any) => {
        const snapshot = await body.toolHandlers.get_case_snapshot({});
        const hypothesis = await body.toolHandlers.evaluate_hypothesis({ snapshot_ref: snapshot.snapshot_ref, evidence });
        const actionResult = await body.toolHandlers.evaluate_action({
          snapshot_ref: snapshot.snapshot_ref, hypothesis_decision_id: hypothesis.decision_id,
          buyer_facts: { intent: { state: "UNKNOWN", citations: [] }, availability: { state: "UNKNOWN", citations: [] }, cod_readiness: { state: "UNKNOWN", citations: [] }, address_change: { state: "UNKNOWN", citations: [] }, after_deadline: { state: "UNKNOWN", citations: [] } },
          missing_info: ["CURRENT_BUYER_INTENT"],
        });
        submitted = await body.toolHandlers.submit_assessment({
          snapshot_ref: snapshot.snapshot_ref, hypothesis_decision_id: hypothesis.decision_id, action_decision_id: actionResult.decision_id,
          assessment: { evidence, hypothesis: "ADDRESS_ISSUE", confidence: "HIGH", missing_info: ["CURRENT_BUYER_INTENT"], question_key: "CONFIRM_INTENT", candidate_action: "STANDARD_REATTEMPT" },
        });
        return stream();
      }),
    };
    const client = new OpenAI({ apiKey: "test-key", maxRetries: 0 });
    await runAgentAssessment(state, client, { model: "gpt-6-sol", sessions: sessions as any });
    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(decisions).toHaveBeenCalledTimes(3);
    expect(Assessment.parse(state.assessment)).toMatchObject({ hypothesis: "CONTACT_ISSUE", confidence: "MEDIUM", candidate_action: "CLARIFY" });
    expect(submitted).toMatchObject({ assessment: { hypothesis: "CONTACT_ISSUE", confidence: "MEDIUM", candidate_action: "CLARIFY" } });
    expect(state.agent_decisions?.hypothesis.probabilities).toHaveLength(7);
    expect(state.agent_decisions?.action.probabilities).toHaveLength(5);
  });

  it("continues once to save a required clarification without repeating Decisions", async () => {
    const actions = ["CLARIFY", "STANDARD_REATTEMPT", "HOLD_DISRUPTION", "ESCALATE_REVIEW", "NO_ACTION"];
    const decisions = vi.spyOn(Decisions.prototype, "create").mockImplementation((async (request: any) => {
      const name = request.questions[0].name;
      if (name === "hypothesis") return { model: "gpt-6-luna", answers: [{ type: "choice", name, choice: "AVAILABILITY_ISSUE", confidence: 0.8,
        probabilities: HYPOTHESES.map((value) => ({ value, probability: value === "AVAILABILITY_ISSUE" ? 1 : 0 })) }] } as any;
      if (name === "evidence_support") return { answers: [{ type: "score", name, score: 1, confidence: 0.8,
        probabilities: [{ value: 0, label: "LOW", probability: 0 }, { value: 1, label: "MEDIUM", probability: 1 }, { value: 2, label: "HIGH", probability: 0 }] }] } as any;
      return { model: "gpt-6-luna", answers: [{ type: "choice", name, choice: "CLARIFY", confidence: 0.8,
        probabilities: actions.map((value) => ({ value, probability: value === "CLARIFY" ? 1 : 0 })) }] } as any;
    }) as any);
    const raw = loadCase("DEMO-005");
    const state = {
      run: { run_id: "run_repair", case: raw, input: raw.input, now: raw.input.failed_event.as_of, applied: [], question_wait_state: null },
      mode: "LIVE_AI", stage: "INITIAL", trigger: "START", snapshot: null, source_index: {}, assessment: null,
      result: null, rules: [], issues: [], model_info: {}, halted: false, trace: [], decision: null, execution_id: "exec_repair",
    } as unknown as PipelineState;
    prepareInput.run(state);
    const evidence = [{ source_ref: raw.sources.find((source) => source.source_type === "FAILED_DELIVERY")!.source_ref,
      fact: "A failed delivery attempt was recorded.", verification: "SOURCE_RECORD" }];
    const unknown = { state: "UNKNOWN", citations: [] };
    const sessions = {
      create: vi.fn(async (request: any) => {
        const snapshot = await request.toolHandlers.get_case_snapshot({});
        const hypothesis = await request.toolHandlers.evaluate_hypothesis({ snapshot_ref: snapshot.snapshot_ref, evidence });
        const action = await request.toolHandlers.evaluate_action({ snapshot_ref: snapshot.snapshot_ref,
          hypothesis_decision_id: hypothesis.decision_id,
          buyer_facts: { intent: unknown, availability: unknown, cod_readiness: unknown, address_change: unknown, after_deadline: unknown },
          missing_info: ["CURRENT_BUYER_INTENT"],
        });
        await request.toolHandlers.submit_assessment({ snapshot_ref: snapshot.snapshot_ref, hypothesis_decision_id: hypothesis.decision_id,
          action_decision_id: action.decision_id,
          assessment: { evidence, hypothesis: "UNKNOWN_CAUSE", confidence: "LOW", missing_info: ["CURRENT_BUYER_INTENT"],
            question_key: "CONFIRM_INTENT", candidate_action: "NO_ACTION" },
        });
        return stream();
      }),
      stream: vi.fn(async (sessionId: string, request: any) => {
        expect(sessionId).toBe("sess_test");
        expect(request.input).toContain("no question was saved");
        await request.toolHandlers.request_clarification({ question_key: "CONFIRM_INTENT", question_text: "Do you still want the parcel?" });
        return Object.assign((async function* () {
          yield { type: "agent.session.turn.completed", event_id: "repair-complete", turn: { id: "turn_repair" }, usage: null };
        })(), { withResultCollection() { return this; }, async finalResult() { return { session_id: "sess_test", turn_id: "turn_repair" }; } });
      }),
    };
    const client = new OpenAI({ apiKey: "test-key", maxRetries: 0 });
    await runAgentAssessment(state, client, { model: "gpt-6-sol", sessions: sessions as any });

    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(sessions.stream).toHaveBeenCalledTimes(1);
    expect(decisions).toHaveBeenCalledTimes(3);
    expect(state.requested_question).toEqual({ question_key: "CONFIRM_INTENT", question_text: "Do you still want the parcel?" });
  });
});

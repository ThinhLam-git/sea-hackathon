import { afterEach, describe, expect, it, vi } from "vitest";
import { Decisions } from "openai/resources/decisions";
import { Simulator } from "../lib/order-rescue-v2/simulator";
import { HYPOTHESES } from "../lib/order-rescue-v2/models";
import { loadCase } from "../lib/order-rescue-v2/fixtures";

afterEach(() => vi.restoreAllMocks());

function stream(sessionId: string, turnId: string, names: string[], created: boolean) {
  const events = [
    ...(created ? [{ type: "agent.session.created", event_id: "created", session: { id: sessionId, environment: { id: "env_lifecycle" } } }] : []),
    ...names.map((name, index) => ({ type: "agent.session.turn.item.done", event_id: `evt_${turnId}_${index}`, turn_id: turnId, item: { type: "function_call", call_id: `call_${turnId}_${index}`, name, turn_id: turnId } })),
    { type: "agent.session.turn.completed", event_id: `evt_${turnId}_done`, turn: { id: turnId }, usage: null },
  ];
  return Object.assign((async function* () { yield* events; })(), {
    withResultCollection() { return this; },
    async finalResult() { return { session_id: sessionId, turn_id: turnId, output_text: "Assessment submitted." }; },
  });
}

describe("Agents API v2.2 lifecycle", () => {
  it("creates one session, continues it for the matching reply, and leaves no-reply model-free", async () => {
    const actions = ["CLARIFY", "STANDARD_REATTEMPT", "HOLD_DISRUPTION", "ESCALATE_REVIEW", "NO_ACTION"] as const;
    let actionCalls = 0;
    const decisions = vi.spyOn(Decisions.prototype, "create").mockImplementation((async (request: any) => {
      const name = request.questions[0].name;
      if (name === "hypothesis") {
        return { model: "gpt-6-luna", answers: [{ type: "choice", name, choice: "AVAILABILITY_ISSUE", confidence: 0.9,
          probabilities: HYPOTHESES.map((value) => ({ value, probability: value === "AVAILABILITY_ISSUE" ? 1 : 0 })) }] } as any;
      }
      if (name === "evidence_support") {
        return { answers: [{ type: "score", name, score: 1, confidence: 0.9, probabilities: [
          { value: 0, label: "LOW", probability: 0 }, { value: 1, label: "MEDIUM", probability: 1 }, { value: 2, label: "HIGH", probability: 0 },
        ] }] } as any;
      }
      actionCalls++;
      const selected = actionCalls === 1 ? "CLARIFY" : "STANDARD_REATTEMPT";
      return { model: "gpt-6-luna", answers: [{ type: "choice", name, choice: selected, confidence: 0.9,
        probabilities: actions.map((value) => ({ value, probability: value === selected ? 1 : 0 })) }] } as any;
    }) as any);

    const raw = loadCase("DEMO-001");
    const evidenceFor = (sources: any[], afterReply: boolean) => [
      { source_ref: raw.sources.find((source) => source.source_type === "FAILED_DELIVERY")!.source_ref, fact: "A failed delivery was recorded.", verification: "SOURCE_RECORD" },
      ...(afterReply ? [{ source_ref: `${raw.case_id}-REPLY`, fact: "The buyer directly describes the arrangement.", verification: "DIRECT_BUYER_STATEMENT" }] : []),
    ];
    const runToolChain = async (handlers: Record<string, (args: any) => Promise<any>>, afterReply: boolean) => {
      const snapshot = await handlers.get_case_snapshot({});
      const evidence = evidenceFor(snapshot.sources, afterReply);
      const hypothesis = await handlers.evaluate_hypothesis({ snapshot_ref: snapshot.snapshot_ref, evidence });
      const unknown = { state: "UNKNOWN", citations: [] };
      const buyer_facts = afterReply ? {
        intent: { state: "YES", citations: [{ source_ref: `${raw.case_id}-REPLY`, quote: "Tôi vẫn muốn nhận" }] },
        availability: { state: "YES", citations: [{ source_ref: `${raw.case_id}-REPLY`, quote: "ngày mai có người ở nhà" }] },
        cod_readiness: unknown, address_change: unknown, after_deadline: unknown,
      } : { intent: unknown, availability: unknown, cod_readiness: unknown, address_change: unknown, after_deadline: unknown };
      const missing_info = afterReply ? [] : ["CURRENT_BUYER_INTENT"];
      const action = await handlers.evaluate_action({ snapshot_ref: snapshot.snapshot_ref, hypothesis_decision_id: hypothesis.decision_id, buyer_facts, missing_info });
      await handlers.submit_assessment({ snapshot_ref: snapshot.snapshot_ref, hypothesis_decision_id: hypothesis.decision_id, action_decision_id: action.decision_id,
        assessment: { evidence, hypothesis: "UNKNOWN_CAUSE", confidence: "LOW", missing_info, question_key: afterReply ? "CONFIRM_INTENT" : "CONFIRM_INTENT", candidate_action: "NO_ACTION" } });
      const names = ["get_case_snapshot", "evaluate_hypothesis", "evaluate_action", "submit_assessment"];
      if (!afterReply) {
        await handlers.request_clarification({ question_key: "CONFIRM_INTENT", question_text: "Bạn còn muốn nhận đơn không?" });
        names.push("request_clarification");
      }
      return names;
    };

    let firstTools: string[] = [];
    let secondTools: string[] = [];
    const sessions = {
      create: vi.fn(async (request: any) => {
        firstTools = await runToolChain(request.toolHandlers, false);
        return stream("sess_run_1", "turn_initial", firstTools, true);
      }),
      stream: vi.fn(async (sessionId: string, request: any) => {
        expect(sessionId).toBe("sess_run_1");
        expect(request.input).toContain("Reassess");
        secondTools = await runToolChain(request.toolHandlers, true);
        return stream(sessionId, "turn_after_reply", secondTools, false);
      }),
    };
    const sim = new Simulator("LIVE_AI", { apiKey: "synthetic-test-key", model: "gpt-6-sol", agentRuntime: "AGENTS_API", agentSessions: sessions as any });
    const [run] = await sim.start(raw.case_id, raw);
    expect(run.agent_session_status).toBe("IDLE");
    expect(run.question_wait_state?.status).toBe("PENDING");
    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(decisions).toHaveBeenCalledTimes(3);

    const sample = "Đúng, lúc đó tôi đang đi làm. Tôi vẫn muốn nhận, ngày mai có người ở nhà.";
    await sim.recordBuyerReply(run.run_id, sample, "event_reply_1", run.question_wait_state!.question_id);
    expect(sessions.stream).toHaveBeenCalledTimes(1);
    expect(run.agent_session_id).toBe("sess_run_1");
    expect(run.agent_environment_id).toBe("env_lifecycle");
    expect(run.final_assessment_source).toBe(2);
    expect(run.final_policy_output?.final_action).toBe("STANDARD_REATTEMPT");
    expect(decisions).toHaveBeenCalledTimes(6);
    expect(run.agent_tool_ledger?.filter((entry) => entry.phase === "INITIAL")).toHaveLength(firstTools.length + 1);
    expect(run.agent_tool_ledger?.filter((entry) => entry.phase === "AFTER_REPLY")).toHaveLength(secondTools.length + 1);
    expect(run.agent_tool_ledger?.some((entry) => entry.tool_name === "decisions_hypothesis_choice")).toBe(true);
    expect(run.agent_tool_ledger?.every((entry) => entry.session_id === "sess_run_1" && entry.turn_id)).toBe(true);
  });

  it("does not continue the session or call Decisions when manually selecting no-reply", async () => {
    const first = vi.spyOn(Decisions.prototype, "create").mockRejectedValue(new Error("unused"));
    const session = { create: vi.fn(), stream: vi.fn() };
    const sim = new Simulator("LIVE_AI", { apiKey: "test-key", model: "gpt-6-sol", agentRuntime: "AGENTS_API", agentSessions: session as any });
    // No inference is needed to exercise the no-reply selection path.
    const raw = loadCase("DEMO-005");
    const run = sim.createRun(raw.case_id, raw);
    run.current_status = "WAITING_FOR_BUYER";
    run.question_wait_state = { question_id: "q1", question_key: "CONFIRM_INTENT", question_text: "Clarify intent.", status: "PENDING", asked_at: run.now };
    run.initial_assessment = { evidence: [{ source_ref: raw.sources[0].source_ref, fact: "Recorded failed attempt.", verification: "SOURCE_RECORD" }], hypothesis: "UNKNOWN_CAUSE", confidence: "LOW", missing_info: ["CURRENT_BUYER_INTENT"], question_key: "CONFIRM_INTENT", candidate_action: "CLARIFY" };
    run.initial_policy_output = { eligibility: "ELIGIBLE", policy_gate: "PERMITTED", final_action: "CLARIFY", reason: "One clarification is available." };
    const initial = structuredClone(run.initial_assessment);
    sim.decisions.set(run.run_id, [{ decision_id: "initial", run_id: run.run_id, case_id: raw.case_id, trigger: "START", decided_at: run.now, record_status: "PENDING", agent: initial, question_text: "Clarify intent.", rules: [], validation_issues: [], skills_run: [], model_info: {}, ...run.initial_policy_output, policy_version: "demo-two-assessment-v2", snapshot_source_refs: [], workflow_execution_id: "exec", reassess_at: null, labels: [] }]);
    sim.noReply(run.run_id, "event_no_reply", "q1");
    expect(run.final_assessment).toEqual(initial);
    expect(run.after_reply_assessment).toBeNull();
    expect(session.create).not.toHaveBeenCalled();
    expect(session.stream).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});

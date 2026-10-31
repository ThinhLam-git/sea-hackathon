import { afterEach, describe, expect, it, vi } from "vitest";
import { Simulator } from "../packages/agent/src/workflow/simulator";
import { inspectAgentSession, snapshotHashForRun } from "../packages/agent/src/runtime/recovery";
import { loadCase } from "../apps/web/lib/application/v2-workflow-data";
import { workflowData } from "../apps/web/lib/application/v2-workflow-data";
import type { AgentToolLedgerEntry } from "../packages/agent/src/models";
import { Decisions } from "openai/resources/decisions";

afterEach(() => vi.restoreAllMocks());

function fakeSessions(status: "requires_action" | "in_progress" | "idle", required_actions: unknown[] = []) {
  const call = { type: "function_call", call_id: "call_snapshot_1", name: "get_case_snapshot", turn_id: "turn_1", status: "in_progress" };
  return {
    retrieve: vi.fn(async () => ({ id: "sess_1", status, required_actions })),
    turns: {
      list: vi.fn(async () => [{ id: "turn_1", status: "waiting", session_id: "sess_1" }]),
      retrieve: vi.fn(async () => ({ id: "turn_1", status: "waiting", session_id: "sess_1" })),
      items: { list: vi.fn(async () => [call]) },
    },
    events: { create: vi.fn(async () => undefined) },
  } as any;
}

const completedSnapshotTool: AgentToolLedgerEntry = {
  tool_id: "tool_snapshot_1", external_call_id: "call_snapshot_1", session_id: "sess_1", turn_id: "turn_1", phase: "INITIAL",
  tool_name: "get_case_snapshot", status: "COMPLETED", result: { snapshot_ref: "sha256:sample", snapshot: { case_id: "DEMO-005" }, sources: [] },
  started_at: "2026-10-31T00:00:00.000Z", completed_at: "2026-10-31T00:00:01.000Z", latency_ms: 1, decision_ids: [],
};

describe("interrupted Agents API run reconciliation", () => {
  it("re-delivers only a completed stored result for the provider's matching pending call", async () => {
    const sessions = fakeSessions("requires_action", [{ type: "function_call", call_id: "call_snapshot_1", name: "get_case_snapshot", turn_id: "turn_1" }]);
    const ledger = [structuredClone(completedSnapshotTool)];
    const result = await inspectAgentSession(sessions, {
      session_id: "sess_1", turn_id: "turn_1", phase: "INITIAL", ledger, expected_snapshot_hash: "sample",
    });
    expect(result.status).toBe("RESULTS_REDELIVERED");
    expect(result.result_delivery_accepted).toBe(1);
    expect(ledger[0]).toMatchObject({ delivery_status: "ACCEPTED", delivery_idempotency_key: "order-rescue-recovery-call_snapshot_1" });
    expect(sessions.events.create).toHaveBeenCalledWith("sess_1", expect.objectContaining({
      events: [{ type: "agent.session.input.tool_result", turn_id: "turn_1", call_id: "call_snapshot_1", success: true, output: expect.stringContaining("DEMO-005") }],
      "Idempotency-Key": "order-rescue-recovery-call_snapshot_1",
    }), expect.objectContaining({ maxRetries: 0 }));
  });

  it("never repeats an unrecorded pending tool or a Decisions request for a changed snapshot", async () => {
    const pending = [{ type: "function_call", call_id: "call_snapshot_1", name: "get_case_snapshot", turn_id: "turn_1" }];
    const missing = fakeSessions("requires_action", pending);
    const noResult = await inspectAgentSession(missing, { session_id: "sess_1", turn_id: "turn_1", phase: "INITIAL", ledger: [], expected_snapshot_hash: "snap" });
    expect(noResult.status).toBe("REMOTE_AWAITING_ACTION");
    expect(missing.events.create).not.toHaveBeenCalled();

    const mismatched = fakeSessions("requires_action", pending);
    const staleLedger = [completedSnapshotTool, { ...completedSnapshotTool, tool_id: "decision_1", attempt_id: "attempt_1", purpose: "action_selection", snapshot_hash: "old-snapshot", status: "SUCCEEDED" as const }];
    const stale = await inspectAgentSession(mismatched, { session_id: "sess_1", turn_id: "turn_1", phase: "INITIAL", ledger: staleLedger, expected_snapshot_hash: "current-snapshot" });
    expect(stale.status).toBe("UNRESOLVED");
    expect(stale.snapshot_matches).toBe(false);
    expect(mismatched.events.create).not.toHaveBeenCalled();
  });

  it("leaves a remote in-progress turn alone", async () => {
    const sessions = fakeSessions("in_progress");
    const result = await inspectAgentSession(sessions, { session_id: "sess_1", turn_id: "turn_1", phase: "INITIAL", ledger: [completedSnapshotTool] });
    expect(result.status).toBe("REMOTE_IN_PROGRESS");
    expect(sessions.events.create).not.toHaveBeenCalled();
  });

  it("finalizes a complete stored assessment chain without any new Decisions call", async () => {
    const raw = loadCase("DEMO-005"), sim = new Simulator("LIVE_AI", { agentRuntime: "AGENTS_API", model: "gpt-6-sol" }, workflowData);
    const run = sim.createRun(raw.case_id, raw);
    run.agent_session_id = "sess_completed"; run.agent_session_status = "ACTIVE"; run.agent_turn_id = "turn_initial";
    const snapshotHash = await snapshotHashForRun(run, "INITIAL"), executionId = "exec_initial";
    const evidence = [{ source_ref: raw.sources.find((source) => source.source_type === "FAILED_DELIVERY")!.source_ref,
      fact: "A failed attempt is recorded.", verification: "SOURCE_RECORD" as const }];
    const hypothesis = {
      decision_id: "hyp_1", request_id: "req_hyp", model: "gpt-6-luna", choice_latency_ms: 2,
      selected: "AVAILABILITY_ISSUE" as const, probabilities: [{ value: "AVAILABILITY_ISSUE" as const, probability: 1 }], api_confidence: 0.9,
      evidence_support: { source: "openai_decisions" as const, model: "gpt-6-luna", rubric_version: "evidence-support-v2.2", score: 20,
        raw_score: 20, rubric_score: 0.4, level: "LOW" as const, scorer_confidence: 0.9, probabilities: [], capped: false,
        decision_id: "score_1", request_id: "req_score" },
    };
    const action = { decision_id: "action_1", request_id: "req_action", model: "gpt-6-luna", hypothesis_decision_id: "hyp_1",
      input_hash: "action_hash", latency_ms: 3, selected: "CLARIFY" as const,
      probabilities: [{ value: "CLARIFY" as const, probability: 1 }], api_confidence: 0.9,
      buyer_facts: { intent: { state: "UNKNOWN", citations: [] }, availability: { state: "UNKNOWN", citations: [] },
        cod_readiness: { state: "UNKNOWN", citations: [] }, address_change: { state: "UNKNOWN", citations: [] }, after_deadline: { state: "UNKNOWN", citations: [] } },
      missing_info: ["CURRENT_BUYER_INTENT"],
    };
    const assessment = { evidence, hypothesis: "AVAILABILITY_ISSUE", confidence: "LOW", missing_info: ["CURRENT_BUYER_INTENT"], question_key: "CONFIRM_INTENT", candidate_action: "CLARIFY" };
    const ledger: AgentToolLedgerEntry[] = [
      { tool_id: "attempt_hyp", attempt_id: "attempt_hyp", external_call_id: "call_hyp", session_id: "sess_completed", turn_id: "turn_initial", phase: "INITIAL", tool_name: "decisions_hypothesis_selection", purpose: "hypothesis_selection", status: "SUCCEEDED", result: hypothesis, started_at: "t0", completed_at: "t1", latency_ms: 10, decision_ids: ["hyp_1"], execution_id: executionId, snapshot_hash: snapshotHash },
      { tool_id: "attempt_score", attempt_id: "attempt_score", external_call_id: "call_hyp", session_id: "sess_completed", turn_id: "turn_initial", phase: "INITIAL", tool_name: "decisions_evidence_support", purpose: "evidence_support", status: "SUCCEEDED", result: hypothesis.evidence_support, started_at: "t0", completed_at: "t1", latency_ms: 10, decision_ids: ["score_1"], execution_id: executionId, snapshot_hash: snapshotHash },
      { tool_id: "attempt_action", attempt_id: "attempt_action", external_call_id: "call_action", session_id: "sess_completed", turn_id: "turn_initial", phase: "INITIAL", tool_name: "decisions_action_selection", purpose: "action_selection", status: "SUCCEEDED", result: action, started_at: "t0", completed_at: "t1", latency_ms: 10, decision_ids: ["action_1"], execution_id: executionId, snapshot_hash: snapshotHash },
      { tool_id: "tool_hyp", external_call_id: "call_hyp", session_id: "sess_completed", turn_id: "turn_initial", phase: "INITIAL", tool_name: "evaluate_hypothesis", status: "COMPLETED", result: hypothesis, started_at: "t0", completed_at: "t1", latency_ms: 10, decision_ids: ["hyp_1", "score_1"] },
      { tool_id: "tool_action", external_call_id: "call_action", session_id: "sess_completed", turn_id: "turn_initial", phase: "INITIAL", tool_name: "evaluate_action", status: "COMPLETED", result: action, started_at: "t0", completed_at: "t1", latency_ms: 10, decision_ids: ["action_1"] },
      { tool_id: "tool_submit", external_call_id: "call_submit", session_id: "sess_completed", turn_id: "turn_initial", phase: "INITIAL", tool_name: "submit_assessment", status: "COMPLETED", result: { accepted: true, assessment, hypothesis_decision_id: "hyp_1", action_decision_id: "action_1" }, started_at: "t0", completed_at: "t1", latency_ms: 10, decision_ids: [] },
      { tool_id: "tool_question", external_call_id: "call_question", session_id: "sess_completed", turn_id: "turn_initial", phase: "INITIAL", tool_name: "request_clarification", status: "COMPLETED", result: { accepted: true, question_key: "CONFIRM_INTENT", question_text: "Do you still want the parcel?", sends_message: false }, started_at: "t0", completed_at: "t1", latency_ms: 10, decision_ids: [] },
    ];
    run.agent_tool_ledger = ledger;
    const decisions = vi.spyOn(Decisions.prototype, "create");

    const result = await sim.reconcileStoredAssessment(run.run_id, snapshotHash);
    expect(result.status).toBe("FINALIZED_FROM_STORED_RESULTS");
    expect(run.current_status).toBe("WAITING_FOR_BUYER");
    expect(run.question_wait_state).toMatchObject({ status: "PENDING", question_key: "CONFIRM_INTENT", question_text: "Do you still want the parcel?" });
    expect(run.initial_assessment).toMatchObject({ candidate_action: "CLARIFY" });
    expect(decisions).not.toHaveBeenCalled();
  });
});

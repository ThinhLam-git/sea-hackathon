import type { RuntimeConfig, WorkflowDataPort } from "../ports/runtime";
import { policyOnly, type AgentToolLedgerEntry, type Decision, type RunState, type RawCase, type PipelineState } from "../models";
import { runPipeline } from "./pipeline";
import { validateBuyerInterpretation } from "../semantics/business-facts";
import { hashJson, recordedAssessmentChain } from "../runtime/recovery";
import * as prepareInput from "../skills/prepare-input/skill";
import * as validateOutput from "../skills/validate-output/skill";
import * as policyGate from "../skills/policy-gate/skill";
import * as composeRecommendation from "../skills/compose-recommendation/skill";
import * as auditLog from "../skills/audit-log/skill";

export class TransitionError extends Error {
  constructor(public code: "invalid_reply" | "not_waiting" | "question_mismatch" | "event_conflict" | "live_required" | "finalized" | "assessment_in_progress") { super(code); }
}

export class Simulator {
  runs = new Map<string, RunState>();
  decisions = new Map<string, Decision[]>();
  private sessionCreatedCheckpoint?: (runId: string, sessionId: string, environmentId: string | null) => void | Promise<void>;
  private turnStartedCheckpoint?: (runId: string, turnId: string) => void | Promise<void>;
  private toolResultCheckpoint?: (runId: string, entry: AgentToolLedgerEntry) => void | Promise<void>;
  private remoteCancelCheckpoint?: (runId: string, status: NonNullable<RunState["agent_remote_cancel_status"]>) => void | Promise<void>;

  constructor(public mode: "REPLAY" | "LIVE_AI" = "REPLAY", private runtime: RuntimeConfig = {}, private data?: WorkflowDataPort) {}

  private get workflowData(): WorkflowDataPort {
    if (!this.data) throw new Error("workflow_data_port_required");
    return this.data;
  }

  bindAgentCheckpoints(checkpoints: {
    onSessionCreated?: (runId: string, sessionId: string, environmentId: string | null) => void | Promise<void>;
    onTurnStarted?: (runId: string, turnId: string) => void | Promise<void>;
    onToolResult?: (runId: string, entry: AgentToolLedgerEntry) => void | Promise<void>;
    onRemoteCancel?: (runId: string, status: NonNullable<RunState["agent_remote_cancel_status"]>) => void | Promise<void>;
  }) {
    this.sessionCreatedCheckpoint = checkpoints.onSessionCreated;
    this.turnStartedCheckpoint = checkpoints.onTurnStarted;
    this.toolResultCheckpoint = checkpoints.onToolResult;
    this.remoteCancelCheckpoint = checkpoints.onRemoteCancel;
  }

  listCases() {
    return this.workflowData.listCases();
  }

  createRun(id: string, override?: RawCase): RunState {
    const c = override ?? this.workflowData.loadCase(id);
    const r: RunState = {
      contract_version: "2.2", run_id: `${id}-${crypto.randomUUID().slice(0, 8)}`, case: c,
      input: structuredClone(c.input), now: new Date(c.input.failed_event.as_of).toISOString(), applied: [],
      current_status: "NEW", question_wait_state: null, initial_assessment: null, initial_policy_output: null,
      after_reply_assessment: null, after_reply_policy_output: null, final_assessment_source: null,
      final_assessment: null, final_policy_output: null, final_event: null, pending_event: null,
      ...(this.mode === "LIVE_AI" && this.runtime.agentRuntime === "AGENTS_API" ? { agent_session_status: "CREATING" as const } : {}),
    };
    this.runs.set(r.run_id, r);
    this.decisions.set(r.run_id, []);
    return r;
  }

  async assessInitial(id: string): Promise<Decision> {
    const r = this.runs.get(id)!;
    if (!r || r.current_status !== "NEW" || r.initial_assessment) throw new TransitionError("finalized");
    const d = await this.assess(r, "INITIAL", "START");
    this.runtime.assessmentSignal?.throwIfAborted();
    if (!r.agent_session_id && ["CREATING", "ACTIVE"].includes(r.agent_session_status ?? "")) r.agent_session_status = "IDLE";
    r.initial_assessment = structuredClone(d.agent);
    r.initial_policy_output = policyOnly(d);
    if (d.question_text && d.agent?.question_key) {
      r.question_wait_state = { question_id: `${r.run_id}-Q1`, question_key: d.agent.question_key, question_text: d.question_text, status: "PENDING", asked_at: r.now };
      r.current_status = "WAITING_FOR_BUYER";
    } else this.finalize(r, 1);
    return d;
  }

  async start(id: string, override?: RawCase): Promise<[RunState, Decision]> {
    const r = this.createRun(id, override);
    return [r, await this.assessInitial(r.run_id)];
  }

  history(id: string) { return this.decisions.get(id)!; }

  /** Finish from already-persisted Decisions and assessment tool results only. */
  async reconcileStoredAssessment(id: string, expectedSnapshotHash: string) {
    const run = this.runs.get(id)!;
    if (run.current_status === "COMPLETED") return { status: "BUSINESS_CASE_ALREADY_FINAL", decision: null } as const;
    const stage: PipelineState["stage"] | null = run.current_status === "NEW" && !run.initial_assessment
      ? "INITIAL"
      : run.current_status === "WAITING_FOR_BUYER" && !!run.pending_event && !run.after_reply_assessment
        ? "AFTER_REPLY"
        : null;
    if (!stage) return { status: "NO_RECONCILABLE_ASSESSMENT", decision: null } as const;
    const chain = recordedAssessmentChain({ phase: stage, expected_snapshot_hash: expectedSnapshotHash,
      ledger: run.agent_tool_ledger ?? [], sources: [...run.case.sources, ...run.applied] });
    if (!chain) return { status: "STORED_CHAIN_INCOMPLETE", decision: null } as const;

    const execution = (run.agent_tool_ledger ?? []).find((entry) => entry.phase === stage && entry.execution_id === chain.execution_id)!;
    const state: PipelineState = {
      run: structuredClone(run), mode: "LIVE_AI", stage,
      trigger: stage === "INITIAL" ? "START" : `${run.case.case_id}-REPLY`,
      snapshot: null, source_index: {}, assessment: chain.assessment, confidence_score: structuredClone(chain.confidence_score),
      result: null, rules: [], issues: [], model_info: { mode: "LIVE_AI", runtime: "OpenAI Agents API", api: "Agents API sessions", model: execution.requested_model ?? this.runtime.model ?? "unknown", recovery: "STORED_RESULT_RECONCILIATION" },
      halted: false, trace: [], decision: null, execution_id: chain.execution_id,
      agent_session_id: run.agent_session_id ?? undefined, agent_turn_id: run.agent_turn_id ?? undefined,
      agent_environment_id: run.agent_environment_id ?? undefined, agent_tool_ledger: structuredClone(run.agent_tool_ledger ?? []),
      agent_decisions: {
        snapshot_hash: expectedSnapshotHash, evidence_hash: await hashJson(chain.assessment.evidence),
        action_input_hash: chain.action.input_hash ?? "", hypothesis: chain.hypothesis,
        action: chain.action, buyer_facts: chain.semantic_facts, missing_info: chain.assessment.missing_info,
      },
      semantic_facts: chain.semantic_facts,
      ...(chain.requested_question ? { requested_question: chain.requested_question } : {}),
      agent_execution: {
        model: execution.requested_model ?? this.runtime.model ?? "unknown", session_id: run.agent_session_id ?? "",
        turn_id: run.agent_turn_id ?? null, environment_id: run.agent_environment_id ?? null,
        tool_calls: (run.agent_tool_ledger ?? []).filter((entry) => entry.phase === stage && entry.external_call_id && !entry.attempt_id).map((entry) => ({ name: entry.tool_name, call_id: entry.external_call_id ?? undefined, turn_id: entry.turn_id ?? undefined })),
        event_ids: [], usage: null,
        decision_requests: (run.agent_tool_ledger ?? []).filter((entry) => entry.phase === stage && entry.attempt_id && entry.status !== "CANCELLED_BEFORE_DISPATCH").length,
        skill_names: [], status: "COMPLETED",
      },
    };
    prepareInput.run(state);
    if (await hashJson(state.snapshot) !== expectedSnapshotHash) return { status: "SNAPSHOT_CHANGED", decision: null } as const;
    state.trace.push("load-case", "prepare-input", "assess-case");
    validateOutput.run(state); state.trace.push("validate-output");
    policyGate.run(state); state.trace.push("policy-gate");
    composeRecommendation.run(state); state.trace.push("compose-recommendation");
    auditLog.run(state); state.trace.push("audit-log");
    const decision = state.decision!;
    this.decisions.get(id)!.push(decision);

    run.agent_session_status = "IDLE";
    if (stage === "INITIAL") {
      run.initial_assessment = structuredClone(decision.agent);
      run.initial_policy_output = policyOnly(decision);
      run.requested_question = chain.requested_question;
      if (decision.record_status === "PENDING" && decision.question_text && chain.requested_question) {
        run.question_wait_state = { question_id: `${run.run_id}-Q1`, question_key: chain.requested_question.question_key,
          question_text: decision.question_text, status: "PENDING", asked_at: run.now };
        run.current_status = "WAITING_FOR_BUYER";
      } else this.finalize(run, 1);
    } else {
      run.after_reply_assessment = structuredClone(decision.agent);
      run.after_reply_policy_output = policyOnly(decision);
      if (run.question_wait_state) run.question_wait_state.status = "ANSWERED";
      const event = run.pending_event!;
      run.final_event = { event_id: event.event_id, type: event.type, text: event.text };
      run.pending_event = null;
      this.finalize(run, 2);
    }
    return { status: "FINALIZED_FROM_STORED_RESULTS", decision } as const;
  }

  prepareBuyerReply(id: string, text: string, eventId: string, questionId: string, useLive = false): boolean {
    const r = this.runs.get(id)!, reply = text.trim();
    if (!reply || reply.length > 2000) throw new TransitionError("invalid_reply");
    if (r.pending_event) {
      if (r.pending_event.event_id === eventId && r.pending_event.text === reply && r.pending_event.question_id === questionId) throw new TransitionError("assessment_in_progress");
      if (r.pending_event.event_id === eventId) throw new TransitionError("event_conflict");
      throw new TransitionError("assessment_in_progress");
    }
    if (r.final_event && r.final_event.event_id === eventId && r.question_wait_state?.question_id !== questionId) throw new TransitionError("event_conflict");
    if (r.final_event) {
      if (r.final_event.event_id === eventId && r.final_event.type === "BUYER_REPLY" && r.final_event.text === reply) return false;
      if (r.final_event.event_id === eventId) throw new TransitionError("event_conflict");
      throw new TransitionError("finalized");
    }
    this.pending(r, questionId);
    const sample = this.workflowData.replaySampleReply?.(r.case.case_id);
    if (this.mode === "REPLAY" && reply !== sample && !useLive) throw new TransitionError("live_required");
    if (useLive) this.mode = "LIVE_AI";
    r.question_wait_state!.status = "ANSWERED";
    r.pending_event = { event_id: eventId, type: "BUYER_REPLY", text: reply, question_id: questionId };
    r.applied.push({ source_ref: `${r.case.case_id}-REPLY`, phase: "RUNTIME", source_type: "BUYER_REPLY", actor: "buyer_recorded_by_staff", occurred_at: r.now, content: { text: reply, question_id: questionId, event_id: eventId } });
    if (this.mode === "LIVE_AI" && this.runtime.agentRuntime === "AGENTS_API") r.agent_session_status = "ACTIVE";
    return true;
  }

  async assessBuyerReply(id: string): Promise<Decision> {
    const r = this.runs.get(id)!;
    if (!r.pending_event) throw new TransitionError("not_waiting");
    const event = r.pending_event;
    const d = await this.assess(r, "AFTER_REPLY", `${r.case.case_id}-REPLY`);
    this.runtime.assessmentSignal?.throwIfAborted();
    if (!r.agent_session_id && ["CREATING", "ACTIVE"].includes(r.agent_session_status ?? "")) r.agent_session_status = "IDLE";
    r.after_reply_assessment = structuredClone(d.agent);
    r.after_reply_policy_output = policyOnly(d);
    if (r.question_wait_state) r.question_wait_state.status = "ANSWERED";
    r.final_event = { event_id: event.event_id, type: event.type, text: event.text };
    r.pending_event = null;
    this.finalize(r, 2);
    return d;
  }

  async recordBuyerReply(id: string, text: string, eventId: string, questionId: string, useLive = false): Promise<Decision | null> {
    if (!this.prepareBuyerReply(id, text, eventId, questionId, useLive)) return null;
    return this.assessBuyerReply(id);
  }

  noReply(id: string, eventId: string, questionId: string): Decision | null {
    const r = this.runs.get(id)!;
    if (r.pending_event) throw new TransitionError("assessment_in_progress");
    if (r.final_event && r.final_event.event_id === eventId && r.question_wait_state?.question_id !== questionId) throw new TransitionError("event_conflict");
    if (r.final_event) {
      if (r.final_event.event_id === eventId && r.final_event.type === "USER_NO_REPLY") return null;
      if (r.final_event.event_id === eventId) throw new TransitionError("event_conflict");
      throw new TransitionError("finalized");
    }
    this.pending(r, questionId);
    r.question_wait_state!.status = "NO_REPLY";
    r.final_event = { event_id: eventId, type: "USER_NO_REPLY" };
    this.finalize(r, 1);
    const initial = this.history(id)[0];
    const d: Decision = { ...structuredClone(initial), decision_id: crypto.randomUUID(), trigger: "USER_NO_REPLY", record_status: "FINAL", question_text: null, skills_run: ["audit-log"], model_info: { ...structuredClone(initial.model_info), final_selection: { source: 1, new_assessment: false, control: "USER_NO_REPLY" } } };
    this.decisions.get(id)!.push(d);
    return d;
  }

  private pending(r: RunState, questionId: string) {
    if (r.current_status !== "WAITING_FOR_BUYER" || r.question_wait_state?.status !== "PENDING") throw new TransitionError("not_waiting");
    if (r.question_wait_state.question_id !== questionId) throw new TransitionError("question_mismatch");
  }

  private finalize(r: RunState, source: 1 | 2) {
    r.current_status = "COMPLETED";
    r.final_assessment_source = source;
    r.final_assessment = structuredClone(source === 1 ? r.initial_assessment : r.after_reply_assessment);
    r.final_policy_output = structuredClone(source === 1 ? r.initial_policy_output : r.after_reply_policy_output);
  }

  private async assess(r: RunState, stage: PipelineState["stage"], trigger: string) {
    const sourceSnapshot = structuredClone(r);
    const replayFacts = stage === "AFTER_REPLY" && this.mode === "REPLAY" ? this.workflowData.replaySemanticFacts?.(r.case.case_id) : undefined;
    const semantic_facts = replayFacts ? validateBuyerInterpretation(replayFacts, [...r.case.sources, ...r.applied]) : undefined;
    const initial: PipelineState = { run: sourceSnapshot, mode: this.mode, stage, trigger, snapshot: null, source_index: {}, assessment: null, result: null, rules: [], issues: [], model_info: {}, halted: false, trace: [], decision: null, execution_id: crypto.randomUUID(), ...(semantic_facts ? { semantic_facts } : {}) };
    const config: RuntimeConfig = {
      ...this.runtime,
      ...(this.mode === "REPLAY" && this.workflowData.replayAssessment ? { replayAssessment: (caseId, phase) => this.workflowData.replayAssessment!(caseId, phase) } : {}),
      onAgentSessionCreated: async (runId, sessionId, environmentId) => {
        const stored = this.runs.get(runId)!;
        stored.agent_session_id = sessionId; stored.agent_environment_id = environmentId; stored.agent_session_status = "ACTIVE";
        await this.sessionCreatedCheckpoint?.(runId, sessionId, environmentId);
        await this.runtime.onAgentSessionCreated?.(runId, sessionId, environmentId);
      },
      onAgentTurnStarted: async (runId, turnId) => {
        const stored = this.runs.get(runId)!;
        stored.agent_turn_id = turnId;
        await this.turnStartedCheckpoint?.(runId, turnId);
        await this.runtime.onAgentTurnStarted?.(runId, turnId);
      },
      onAgentToolResult: async (runId, entry) => {
        const stored = this.runs.get(runId)!;
        stored.agent_tool_ledger ??= [];
        const index = entry.attempt_id ? stored.agent_tool_ledger.findIndex((item) => item.attempt_id === entry.attempt_id) : -1;
        if (index < 0) stored.agent_tool_ledger.push(entry);
        else stored.agent_tool_ledger[index] = entry;
        if (entry.tool_name === "request_clarification" && entry.result && typeof entry.result === "object") {
          const question = entry.result as { accepted?: unknown; question_key?: unknown; question_text?: unknown };
          if (question.accepted === true && (question.question_key === "CONFIRM_INTENT" || question.question_key === "CLARIFY_LANDMARK") && typeof question.question_text === "string") {
            stored.requested_question = { question_key: question.question_key, question_text: question.question_text };
          }
        }
        await this.toolResultCheckpoint?.(runId, entry);
        await this.runtime.onAgentToolResult?.(runId, entry);
      },
      onAgentRemoteCancel: async (runId, status) => {
        this.runs.get(runId)!.agent_remote_cancel_status = status;
        await this.remoteCancelCheckpoint?.(runId, status);
        await this.runtime.onAgentRemoteCancel?.(runId, status);
      },
    };
    const result = await runPipeline(initial, config);
    Object.assign(r, result.run);
    const decision = result.decision!;
    this.decisions.get(r.run_id)!.push(decision);
    return decision;
  }
}

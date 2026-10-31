import OpenAI from "openai";
import { Assessment, type AgentToolLedgerEntry, type ConfidenceScore, type DecisionFailureCategory, type PipelineState, type RunState } from "../models";
import { classifyAgentFailure } from "../decisions/request";
import { validateBuyerInterpretation, BuyerInterpretationSchema, type BuyerInterpretation } from "../semantics/business-facts";
import type { ActionDecision, HypothesisDecisionRef } from "../decisions";
import type { EvidenceSupportDecision } from "../decisions/confidence";
import * as prepareInput from "../skills/prepare-input/skill";

export async function hashJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function snapshotHashForRun(run: RunState, phase: "INITIAL" | "AFTER_REPLY"): Promise<string> {
  const state: PipelineState = {
    run: structuredClone(run), mode: "LIVE_AI", stage: phase,
    trigger: phase === "INITIAL" ? "START" : `${run.case.case_id}-REPLY`,
    snapshot: null, source_index: {}, assessment: null, result: null, rules: [], issues: [],
    model_info: {}, halted: false, trace: [], decision: null, execution_id: "recovery-inspection",
  };
  prepareInput.run(state);
  return hashJson(state.snapshot);
}

export type RecoveryStatus =
  | "REMOTE_IN_PROGRESS"
  | "REMOTE_AWAITING_ACTION"
  | "REMOTE_IDLE"
  | "REMOTE_FAILED"
  | "REMOTE_OUTPUT_RECORDED"
  | "RESULTS_REDELIVERED"
  | "UNRESOLVED"
  | "INSPECTION_FAILED";

export interface PendingRemoteTool {
  call_id: string;
  name: string;
  turn_id: string;
  stored_result: boolean;
  remote_output_status: string | null;
}

export interface AgentSessionInspection {
  status: RecoveryStatus;
  remote_status: "idle" | "in_progress" | "requires_action" | "failed" | "unknown";
  remote_turn_status: string | null;
  pending_work: PendingRemoteTool[];
  snapshot_matches: boolean;
  failure_category?: DecisionFailureCategory;
  next_action: string;
  result_delivery_accepted?: number;
}

export interface RecordedAssessmentChain {
  assessment: import("../models").Assessment;
  semantic_facts: BuyerInterpretation;
  confidence_score: EvidenceSupportDecision;
  hypothesis: HypothesisDecisionRef;
  action: ActionDecision;
  requested_question: RunState["requested_question"];
  execution_id: string;
}

/** Validate a fully checkpointed six-field commit without repeating any Decisions call. */
export function recordedAssessmentChain(input: {
  phase: "INITIAL" | "AFTER_REPLY";
  expected_snapshot_hash: string;
  ledger: AgentToolLedgerEntry[];
  sources: RunState["case"]["sources"];
}): RecordedAssessmentChain | null {
  const entries = input.ledger.filter((entry) => entry.phase === input.phase);
  const tool = (name: string) => [...entries].reverse().find((entry) => entry.tool_name === name && entry.status === "COMPLETED");
  const hypothesisEntry = tool("evaluate_hypothesis"), actionEntry = tool("evaluate_action"), submission = tool("submit_assessment");
  if (!hypothesisEntry || !actionEntry || !submission) return null;
  const hypothesis = hypothesisEntry.result as HypothesisDecisionRef;
  const actionResult = actionEntry.result as (ActionDecision & { buyer_facts?: unknown; missing_info?: unknown });
  const submitted = submission.result as { accepted?: unknown; assessment?: unknown; hypothesis_decision_id?: unknown; action_decision_id?: unknown };
  if (!hypothesis?.decision_id || !hypothesis.evidence_support?.decision_id || !actionResult?.decision_id ||
      actionResult.hypothesis_decision_id !== hypothesis.decision_id || submitted.accepted !== true ||
      submitted.hypothesis_decision_id !== hypothesis.decision_id || submitted.action_decision_id !== actionResult.decision_id) return null;
  const requestSucceeded = (purpose: string, decisionId: string) => entries.some((entry) => entry.attempt_id && entry.purpose === purpose &&
    entry.status === "SUCCEEDED" && entry.decision_ids.includes(decisionId) && entry.snapshot_hash === input.expected_snapshot_hash);
  const successfulAttempts = entries.filter((entry) => entry.attempt_id && entry.status === "SUCCEEDED" && entry.decision_ids.length > 0);
  if (!requestSucceeded("hypothesis_selection", hypothesis.decision_id) ||
      !requestSucceeded("evidence_support", hypothesis.evidence_support.decision_id) ||
      !requestSucceeded("action_selection", actionResult.decision_id) ||
      successfulAttempts.some((entry) => !entry.execution_id) ||
      new Set(successfulAttempts.map((entry) => entry.execution_id)).size !== 1) return null;
  let assessment: import("../models").Assessment;
  let semantic_facts: BuyerInterpretation;
  try {
    assessment = Assessment.parse(submitted.assessment);
    semantic_facts = validateBuyerInterpretation(BuyerInterpretationSchema.parse(actionResult.buyer_facts), input.sources);
  } catch { return null; }
  if (assessment.hypothesis !== hypothesis.selected || assessment.confidence !== hypothesis.evidence_support.level ||
      assessment.candidate_action !== actionResult.selected ||
      JSON.stringify(assessment.missing_info) !== JSON.stringify(actionResult.missing_info)) return null;
  const clarification = tool("request_clarification")?.result as { accepted?: unknown; question_key?: unknown; question_text?: unknown } | undefined;
  const requested_question = clarification?.accepted === true &&
    (clarification.question_key === "CONFIRM_INTENT" || clarification.question_key === "CLARIFY_LANDMARK") &&
    typeof clarification.question_text === "string"
      ? { question_key: clarification.question_key, question_text: clarification.question_text } as RunState["requested_question"]
      : null;
  if (requested_question && (assessment.candidate_action !== "CLARIFY" || assessment.question_key !== requested_question.question_key)) return null;
  const confidence_score = hypothesis.evidence_support as EvidenceSupportDecision & ConfidenceScore;
  return { assessment, semantic_facts, confidence_score, hypothesis, action: actionResult, requested_question, execution_id: successfulAttempts[0].execution_id! };
}

function textOutput(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return null; }
}

function turnItems(sessions: OpenAI["beta"]["agents"]["sessions"], turnId: string, sessionId: string, signal?: AbortSignal) {
  return sessions.turns.items.list(turnId, { session_id: sessionId, order: "asc" }, { maxRetries: 0, timeout: 10_000, ...(signal ? { signal } : {}) });
}

/** Inspect the provider's session, turns, and function outputs without starting inference. */
export async function inspectAgentSession(
  sessions: OpenAI["beta"]["agents"]["sessions"],
  input: { session_id: string; turn_id?: string | null; expected_snapshot_hash?: string | null; phase: "INITIAL" | "AFTER_REPLY"; ledger: AgentToolLedgerEntry[]; signal?: AbortSignal },
): Promise<AgentSessionInspection> {
  const options = { maxRetries: 0, timeout: 10_000, ...(input.signal ? { signal: input.signal } : {}) };
  try {
    input.signal?.throwIfAborted();
    const [session, turnsPage] = await Promise.all([
      sessions.retrieve(input.session_id, options),
      sessions.turns.list(input.session_id, { order: "desc", limit: 20 }, options),
    ]);
    const turns = [];
    for await (const turn of turnsPage) {
      turns.push(turn);
      if (turns.length >= 20) break;
    }
    let persistedTurn = input.turn_id ? turns.find((turn) => turn.id === input.turn_id) : undefined;
    if (!persistedTurn && input.turn_id) persistedTurn = await sessions.turns.retrieve(input.turn_id, { session_id: input.session_id }, options);
    const latestTurn = persistedTurn ?? turns[0] ?? null;
    const pendingCalls = session.required_actions.filter((item) => item.type === "function_call");
    const relevantTurnIds = new Set<string>([
      ...(latestTurn ? [latestTurn.id] : []),
      ...pendingCalls.map((call) => call.turn_id),
    ]);
    const remoteOutputs = new Map<string, string>();
    for (const turnId of relevantTurnIds) {
      for await (const item of await turnItems(sessions, turnId, input.session_id, input.signal)) {
        if (item.type === "function_call_output") remoteOutputs.set(item.call_id, item.status);
      }
    }
    const phaseEntries = input.ledger.filter((entry) => entry.phase === input.phase);
    const attempts = phaseEntries.filter((entry) => !!entry.attempt_id && entry.status !== "CANCELLED_BEFORE_DISPATCH");
    const snapshotEntry = phaseEntries.find((entry) => entry.tool_name === "get_case_snapshot" && entry.status === "COMPLETED");
    const snapshotResult = snapshotEntry?.result as { snapshot_ref?: unknown } | null | undefined;
    const snapshotMatches = (!attempts.length || !!input.expected_snapshot_hash && attempts.every((entry) => entry.snapshot_hash === input.expected_snapshot_hash)) &&
      (!input.expected_snapshot_hash || !snapshotEntry || snapshotResult?.snapshot_ref === `sha256:${input.expected_snapshot_hash}`);
    const pendingWork = pendingCalls.map((call) => {
      const stored = phaseEntries.find((entry) => entry.external_call_id === call.call_id && entry.tool_name === call.name && entry.status === "COMPLETED");
      return {
        call_id: call.call_id,
        name: call.name,
        turn_id: call.turn_id,
        stored_result: !!stored && textOutput(stored.result) !== null,
        remote_output_status: remoteOutputs.get(call.call_id) ?? null,
      };
    });

    if (!snapshotMatches) return {
      status: "UNRESOLVED", remote_status: session.status, remote_turn_status: latestTurn?.status ?? null,
      pending_work: pendingWork, snapshot_matches: false, next_action: "Review the changed snapshot; do not re-run or replay stored Decisions requests.",
    };
    if (session.status === "in_progress") return {
      status: "REMOTE_IN_PROGRESS", remote_status: session.status, remote_turn_status: latestTurn?.status ?? null,
      pending_work: pendingWork, snapshot_matches: true, next_action: "Inspect again after the remote turn settles. Do not submit another event.",
    };
    if (session.status === "failed") return {
      status: "REMOTE_FAILED", remote_status: session.status, remote_turn_status: latestTurn?.status ?? null,
      pending_work: pendingWork, snapshot_matches: true, failure_category: "provider", next_action: "Keep the case unresolved and send it to Ops review.",
    };
    if (session.status === "requires_action") {
      if (!pendingWork.length || pendingWork.some((work) => !work.stored_result)) return {
        status: "REMOTE_AWAITING_ACTION", remote_status: session.status, remote_turn_status: latestTurn?.status ?? null,
        pending_work: pendingWork, snapshot_matches: true, next_action: "A pending tool has no completed stored result. Do not repeat it; send the run to Ops review.",
      };
      const requiredDelivery = pendingWork.filter((work) => work.remote_output_status !== "completed");
      if (!requiredDelivery.length) return {
        status: "REMOTE_OUTPUT_RECORDED", remote_status: session.status, remote_turn_status: latestTurn?.status ?? null,
        pending_work: pendingWork, snapshot_matches: true, result_delivery_accepted: 0,
        next_action: "The provider already records these outputs. Inspect the same session again after it settles; do not duplicate tool results.",
      };
      let delivered = 0;
      for (const work of requiredDelivery) {
        const entry = phaseEntries.find((item) => item.external_call_id === work.call_id && item.tool_name === work.name && item.status === "COMPLETED")!;
        const output = textOutput(entry.result);
        if (output === null) return {
          status: "UNRESOLVED", remote_status: session.status, remote_turn_status: latestTurn?.status ?? null,
          pending_work: pendingWork, snapshot_matches: true, next_action: "A stored tool result is not serializable. Send the run to Ops review.",
        };
        const idempotencyKey = entry.delivery_idempotency_key ?? `order-rescue-recovery-${work.call_id}`;
        entry.delivery_idempotency_key = idempotencyKey;
        entry.delivery_status = "SUBMITTING";
        try {
          await sessions.events.create(input.session_id, {
            events: [{ type: "agent.session.input.tool_result", turn_id: work.turn_id, call_id: work.call_id, success: true, output }],
            "Idempotency-Key": idempotencyKey,
          }, options);
          entry.delivery_status = "ACCEPTED";
          delivered++;
        } catch {
          entry.delivery_status = "AMBIGUOUS";
          return {
            status: "UNRESOLVED", remote_status: session.status, remote_turn_status: latestTurn?.status ?? null,
            pending_work: pendingWork, snapshot_matches: true, result_delivery_accepted: delivered,
            next_action: "The provider's result-delivery outcome is ambiguous. Inspect the same session again; do not create a new one.",
          };
        }
      }
      return {
        status: "RESULTS_REDELIVERED", remote_status: session.status, remote_turn_status: latestTurn?.status ?? null,
        pending_work: pendingWork, snapshot_matches: true, result_delivery_accepted: delivered,
        next_action: "The provider accepted stored results; inspect the same session again after it settles. Acceptance is not proof of durable completion.",
      };
    }
    return {
      status: "REMOTE_IDLE", remote_status: session.status, remote_turn_status: latestTurn?.status ?? null,
      pending_work: pendingWork, snapshot_matches: true, next_action: "Check for a complete validated assessment in the stored tool ledger; otherwise keep the run unresolved for Ops review.",
    };
  } catch (error) {
    return {
      status: "INSPECTION_FAILED", remote_status: "unknown", remote_turn_status: null, pending_work: [],
      snapshot_matches: false, failure_category: classifyAgentFailure(error),
      next_action: "Provider inspection failed. Keep the run unresolved; do not recreate the session or replay Decisions calls.",
    };
  }
}

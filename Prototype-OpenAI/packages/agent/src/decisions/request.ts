import OpenAI from "openai";
import type { AgentToolLedgerEntry, DecisionFailureCategory } from "../models";

export type DecisionRequestPurpose = "hypothesis_selection" | "evidence_support" | "action_selection";
export interface DecisionRequestContext {
  execution_id: string;
  snapshot_hash: string;
  phase: "INITIAL" | "AFTER_REPLY";
  session_id?: string | null;
  turn_id?: string | null;
  external_call_id?: string | null;
  signal?: AbortSignal;
  onAttempt?: (entry: AgentToolLedgerEntry) => void | Promise<void>;
}

type DecisionRequest = Parameters<OpenAI["decisions"]["create"]>[0];
type DecisionResponse = Awaited<ReturnType<OpenAI["decisions"]["create"]>>;

function safeLabel(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return typeof value === "string" && /^[A-Z0-9_]{1,40}$/.test(value) ? value : null;
}

function safeDistribution(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const label = safeLabel(entry.value);
    const probability = entry.probability;
    if (label === null || typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) return [];
    const result: Record<string, unknown> = { value: label, probability };
    const band = safeLabel(entry.label);
    if (band !== null) result.label = band;
    return [result];
  });
}

function providerResponse(response: DecisionResponse): unknown {
  const answers = (response as { answers?: unknown }).answers;
  if (!Array.isArray(answers)) return { answer_count: 0 };
  return {
    answers: answers.map((value) => {
      if (!value || typeof value !== "object") return { type: "unknown" };
      const answer = value as Record<string, unknown>;
      const name = answer.name === "hypothesis" || answer.name === "evidence_support" || answer.name === "candidate_action" ? answer.name : "unknown";
      if (answer.type === "refusal") return { type: "refusal", name };
      if (answer.type === "choice") return {
        type: answer.type,
        name,
        choice: safeLabel(answer.choice),
        confidence: typeof answer.confidence === "number" && Number.isFinite(answer.confidence) ? answer.confidence : null,
        probabilities: safeDistribution(answer.probabilities),
      };
      if (answer.type === "score") return {
        type: answer.type,
        name,
        score: typeof answer.score === "number" && Number.isFinite(answer.score) ? answer.score : null,
        confidence: typeof answer.confidence === "number" && Number.isFinite(answer.confidence) ? answer.confidence : null,
        probabilities: safeDistribution(answer.probabilities),
      };
      return { type: typeof answer.type === "string" ? answer.type : "unknown" };
    }),
  };
}

function requestId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = value as Record<string, unknown>;
  return typeof error.request_id === "string" ? error.request_id : typeof error._request_id === "string" ? error._request_id : null;
}

function failure(error: unknown, signal: AbortSignal, timeout: AbortSignal): { category: DecisionFailureCategory; status: AgentToolLedgerEntry["status"] } {
  if (error instanceof Error && (error.message === "decisions_refused" || error.message === "confidence_refused")) return { category: "refusal", status: "REFUSED" };
  if (error instanceof Error && (error.message === "invalid_decisions_output" || error.message === "invalid_confidence_output")) return { category: "invalid_output", status: "INVALID_OUTPUT" };
  if (signal.aborted || timeout.aborted || error instanceof Error && (error.name === "AbortError" || error.name === "APIUserAbortError" || error.name.includes("Timeout"))) {
    return { category: timeout.aborted && !signal.aborted ? "timeout" : "cancelled", status: "AMBIGUOUS" };
  }
  if (error && typeof error === "object") {
    const item = error as { status?: unknown; code?: unknown; name?: unknown };
    if (item.status === 401 || item.status === 403) return { category: "authentication", status: "ERROR" };
    if (item.status === 429) return { category: item.code === "insufficient_quota" ? "quota" : "rate_limit", status: "ERROR" };
    if (typeof item.status === "number" && item.status >= 500) return { category: "provider", status: "ERROR" };
    if (typeof item.status !== "number" || item.status === 0) return { category: "network", status: "AMBIGUOUS" };
  }
  return { category: "unknown", status: "ERROR" };
}

function finishAttempt(entry: AgentToolLedgerEntry, status: AgentToolLedgerEntry["status"], latency: number) {
  entry.status = status;
  entry.completed_at = new Date().toISOString();
  entry.latency_ms = Math.max(0, Math.round(latency));
}

/** Write the attempt before dispatch, then update the same durable ledger entry. */
export async function requestDecision<T>(
  client: OpenAI,
  request: DecisionRequest,
  purpose: DecisionRequestPurpose,
  requestedModel: string,
  context: DecisionRequestContext,
  parse: (response: DecisionResponse) => T,
): Promise<{ response: DecisionResponse; parsed: T; attempt: AgentToolLedgerEntry }> {
  context.signal?.throwIfAborted();
  const attemptId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const attempt: AgentToolLedgerEntry = {
    tool_id: `decision_${attemptId.replaceAll("-", "")}`,
    attempt_id: attemptId,
    external_call_id: context.external_call_id ?? null,
    session_id: context.session_id ?? null,
    turn_id: context.turn_id ?? null,
    phase: context.phase,
    tool_name: `decisions_${purpose}`,
    purpose,
    status: "IN_PROGRESS",
    result: null,
    started_at: startedAt,
    completed_at: null,
    latency_ms: null,
    decision_ids: [],
    execution_id: context.execution_id,
    snapshot_hash: context.snapshot_hash,
    requested_model: requestedModel,
    returned_model: null,
    request_id: null,
    usage: { available: false, reason: "pending" },
    provider_response: null,
    delivery_status: "NOT_STARTED",
  };
  await context.onAttempt?.(structuredClone(attempt));
  if (context.signal?.aborted) {
    finishAttempt(attempt, "CANCELLED_BEFORE_DISPATCH", 0);
    attempt.failure_category = "cancelled";
    attempt.usage = { available: false, reason: "not_dispatched" };
    await context.onAttempt?.(structuredClone(attempt));
    context.signal.throwIfAborted();
  }
  const started = performance.now();
  const timeout = AbortSignal.timeout(15_000);
  const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
  let response: DecisionResponse | undefined;
  try {
    response = await client.decisions.create(request, { maxRetries: 0, timeout: 15_000, signal });
    context.signal?.throwIfAborted();
    attempt.request_id = (response as { _request_id?: string })._request_id ?? null;
    attempt.returned_model = response.model ?? null;
    const usage = (response as { usage?: unknown }).usage;
    attempt.usage = usage === undefined || usage === null ? { available: false, reason: "provider_omitted" } : { available: true, value: usage };
    attempt.provider_response = providerResponse(response);
    const parsed = parse(response);
    finishAttempt(attempt, "SUCCEEDED", performance.now() - started);
    attempt.result = parsed;
    await context.onAttempt?.(structuredClone(attempt));
    return { response, parsed, attempt };
  } catch (error) {
    if (attempt.status === "IN_PROGRESS") {
      const classified = failure(error, context.signal ?? new AbortController().signal, timeout);
      finishAttempt(attempt, classified.status, performance.now() - started);
      attempt.failure_category = classified.category;
      attempt.request_id ??= requestId(error);
      if (response) {
        attempt.returned_model ??= response.model ?? null;
        const usage = (response as { usage?: unknown }).usage;
        attempt.usage = usage === undefined || usage === null ? { available: false, reason: "provider_omitted" } : { available: true, value: usage };
        attempt.provider_response ??= providerResponse(response);
      } else attempt.usage = { available: false, reason: classified.status === "AMBIGUOUS" ? "request_completion_unknown" : "provider_no_response" };
      await context.onAttempt?.(structuredClone(attempt));
    }
    throw error;
  }
}

export async function updateDecisionAttempt(context: DecisionRequestContext | undefined, attempt: AgentToolLedgerEntry | undefined, result: unknown, decisionId: string) {
  if (!context || !attempt) return;
  attempt.result = result;
  attempt.decision_ids = [decisionId];
  await context.onAttempt?.(structuredClone(attempt));
}

export function classifyAgentFailure(error: unknown): DecisionFailureCategory {
  if (error instanceof Error) {
    if (error.message === "decisions_refused" || error.message === "confidence_refused") return "refusal";
    if (error.message === "invalid_decisions_output" || error.message === "invalid_confidence_output") return "invalid_output";
    if (error.message === "clarification_repair_only" || error.message === "invalid_semantic_provenance" || error.message === "assessment_chain_incomplete") return "tool_validation";
    if (error.name === "AbortError" || error.name === "APIUserAbortError") return "cancelled";
    if (error.name.includes("Timeout")) return "timeout";
  }
  const classified = failure(error, new AbortController().signal, new AbortController().signal);
  return classified.category;
}

import { Simulator, TransitionError } from "../../../../packages/agent/src/workflow/simulator";
import type { PublicRunView } from "../../../../packages/contracts/src/index";
import { CONFIDENCE_MODEL } from "../../../../packages/agent/src/decisions/confidence-contract";
import { caseIds, workflowData } from "./v2-workflow-data";
import { runView } from "./v2-view";
import { createSimulator } from "./order-rescue";
import { runtime, restore, persist, checkpoint, reserve, release, HttpError, inspectAndReconcile } from "../infrastructure/order-rescue-repository";

export async function listCases() {
  return createSimulator().listCases();
}

export async function createRun(owner: string, body: { case_id: string; mode: "REPLAY" | "LIVE_AI" }, signal: AbortSignal): Promise<PublicRunView> {
  if (!caseIds.includes(body.case_id)) throw new HttpError(404, "Unknown case");
  let revision = 0;
  const config = runtime(signal);
  if (body.mode === "LIVE_AI" && !config.openAIClient) throw new HttpError(503, "Live GPT is not configured yet. Replay is available.");
  const sim = createSimulator(body.mode, config), run = sim.createRun(body.case_id);
  await persist(sim, run.run_id, owner);
  sim.bindAgentCheckpoints({
    onSessionCreated: async () => { await persist(sim, run.run_id, owner, revision); revision++; },
    onTurnStarted: async () => { await persist(sim, run.run_id, owner, revision); revision++; },
    onToolResult: async () => { await persist(sim, run.run_id, owner, revision); revision++; },
    onRemoteCancel: async () => { await persist(sim, run.run_id, owner, revision); revision++; },
  });
  await sim.assessInitial(run.run_id);
  await persist(sim, run.run_id, owner, revision);
  return runView(sim, run.run_id);
}

export async function getRun(id: string, owner: string): Promise<PublicRunView> {
  const { sim } = await restore(id, owner);
  return runView(sim, id);
}

function bindReplyCheckpoints(sim: Simulator, id: string, owner: string, lease: { revision: number; token: string }) {
  sim.bindAgentCheckpoints({
    onSessionCreated: async () => checkpoint(sim, id, owner, lease),
    onTurnStarted: async () => checkpoint(sim, id, owner, lease),
    onToolResult: async () => checkpoint(sim, id, owner, lease),
    onRemoteCancel: async () => checkpoint(sim, id, owner, lease),
  });
}

export async function replyToRun(owner: string, id: string, body: { text?: string; use_sample: boolean; event_id: string; question_id: string; use_live: boolean }, signal: AbortSignal): Promise<PublicRunView> {
  const { sim, revision } = await restore(id, owner, true, signal);
  const replyText = body.use_sample ? workflowData.replaySampleReply?.(sim.runs.get(id)!.case.case_id) : body.text;
  if (!replyText) throw new HttpError(409, "No prepared sample response is available for this case.");
  const config = runtime(signal);
  if ((body.use_live || sim.mode === "LIVE_AI") && !config.openAIClient) throw new HttpError(503, "Live GPT is unavailable. Start a Replay review to use the sample response.");
  const lease = await reserve(id, owner, revision);
  try {
    bindReplyCheckpoints(sim, id, owner, lease);
    if (sim.prepareBuyerReply(id, replyText, body.event_id, body.question_id, body.use_live)) {
      await checkpoint(sim, id, owner, lease);
      await sim.assessBuyerReply(id);
      await persist(sim, id, owner, lease.revision, lease.token);
    }
  } catch (error) {
    if (error instanceof TransitionError) throw new HttpError(409, error.code === "live_required"
      ? "Custom text requires Live GPT. Use the sample response for Replay."
      : error.code === "question_mismatch" ? "This response does not match the pending question. Refresh the case."
        : error.code === "assessment_in_progress" ? "A previous assessment is unresolved. Do not resubmit the reply; the run needs explicit recovery."
          : "This question already has an outcome, or the submission conflicts with it. Review the latest record.");
    throw error;
  } finally {
    await release(id, owner, lease);
  }
  return runView(sim, id);
}

export async function selectNoReply(owner: string, id: string, body: { event_id: string; question_id: string }, signal: AbortSignal): Promise<PublicRunView> {
  const { sim, revision } = await restore(id, owner, true, signal);
  const lease = await reserve(id, owner, revision);
  try {
    if (sim.noReply(id, body.event_id, body.question_id)) await persist(sim, id, owner, lease.revision, lease.token);
  } catch (error) {
    if (error instanceof TransitionError) throw new HttpError(409, "This question already has an outcome or does not match the pending question. Refresh and review the case.");
    throw error;
  } finally {
    await release(id, owner, lease);
  }
  return runView(sim, id);
}

export async function recoverRun(owner: string, id: string, signal: AbortSignal) {
  const { sim, revision } = await restore(id, owner, false, signal);
  if (sim.runs.get(id)!.current_status === "COMPLETED") return { recovery: await inspectAndReconcile(sim, id, signal), run: runView(sim, id) };
  const lease = await reserve(id, owner, revision);
  try {
    const recovery = await inspectAndReconcile(sim, id, signal);
    const mutating = !["BUSINESS_CASE_ALREADY_FINAL", "SESSION_ID_UNKNOWN", "NO_INTERRUPTED_ASSESSMENT", "REMOTE_IN_PROGRESS", "INSPECTION_FAILED"].includes(recovery.status);
    if (mutating) await persist(sim, id, owner, lease.revision, lease.token);
    return { recovery, run: runView(sim, id) };
  } finally {
    await release(id, owner, lease);
  }
}

export function status() {
  const config = runtime();
  return { live_available: !!config.openAIClient, model: config.model, agent: "OpenAI Agents API",
    api: config.agentRuntime === "LEGACY_RESPONSES" ? "Responses API (explicit rollback)" : "Agents API sessions",
    runtime: config.agentRuntime, agent_timeout_ms: config.agentTimeoutMs, max_tool_calls: config.maxAgentToolCalls,
    confidence_api: "Decisions API", confidence_model: CONFIDENCE_MODEL, contract_version: "2.2", case_count: caseIds.length,
    no_reply: "MANUAL_USER_NO_REPLY" };
}

\n
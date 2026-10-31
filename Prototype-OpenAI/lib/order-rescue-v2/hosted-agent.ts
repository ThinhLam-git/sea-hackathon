import { z } from "zod";
import { openaiRequest, OpenAIHttpError } from "../openai-http";
import { Assessment } from "./models";
import { PROMPT, PROMPT_VERSION } from "./skills/assess-case/prompt";

export const MODEL = "gpt-5.4-mini";
export type AgentAudit = {
  status: string; session_id?: string; turn_id?: string; agent_id?: string;
  cancellation?: "confirmed" | "unconfirmed"; error_code?: string;
};
type Turn = { id: string; session_id: string; agent_id: string; status: string };
type Session = { id: string; status: string; required_actions: unknown[] };
type Items = { has_more: boolean; data: Array<{
  type: string; role?: string; phase?: string; status?: string; turn_id: string;
  content?: Array<{ type: string; text?: string }>;
}> };
export class HostedAgentError extends Error {
  constructor(public code: string) { super(code); }
}
const terminal = (status: string) => ["completed", "failed", "cancelled"].includes(status);
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** One isolated managed session per assessment. Never resubmit input on observation failure. */
export async function assessWithHostedAgent(apiKey: string, model: string, snapshot: unknown,
  audit: AgentAudit, metadata: { run_id: string; stage: string },
  timing = { timeoutMs: 45000, pollMs: 500, cleanupMs: 8000 },
): Promise<Assessment> {
  const signal = AbortSignal.timeout(timing.timeoutMs);
  let finished = false;
  const request = <T>(path: string) => openaiRequest<T>(apiKey, path, { signal });
  try {
    audit.status = "creating";
    // Session creation is deliberately not retried: a lost POST response is ambiguous.
    const session = await openaiRequest<Session>(apiKey, "/agents/sessions", {
      signal, body: {
        environment: { type: "none" }, stream: false,
        agent: { model, instructions: PROMPT, tools: [], multi_agent: { enabled: false },
          text: { format: { type: "json_schema", schema: z.toJSONSchema(Assessment) } } },
        input: JSON.stringify(snapshot),
        metadata: { app: "order-rescue", contract: "2.2", prompt_version: PROMPT_VERSION, ...metadata },
      },
    });
    if (!session.id) throw new HostedAgentError("invalid_agent_session");
    audit.session_id = session.id;
    const base = `/agents/sessions/${encodeURIComponent(session.id)}`;
    let readFailures = 0;
    while (!signal.aborted) {
      try {
        const turns = await request<{ data: Turn[]; has_more: boolean }>(`${base}/turns?order=asc&limit=2`);
        if (turns.has_more || turns.data.length > 1) throw new HostedAgentError("unexpected_agent_turn");
        const turn = turns.data[0];
        if (turn) {
          if (turn.session_id !== session.id) throw new HostedAgentError("invalid_agent_turn");
          audit.turn_id = turn.id; audit.agent_id = turn.agent_id; audit.status = turn.status;
          finished = terminal(turn.status);
          if (turn.status === "failed" || turn.status === "cancelled") throw new HostedAgentError(`agent_${turn.status}`);
          if (turn.status === "completed") {
            // Read durable items, never commentary, stream deltas or another turn's output.
            // Briefly recover a completed turn whose items have not become visible yet.
            for (let attempt = 0; attempt < 3; attempt++) {
              const items = await request<Items>(`${base}/turns/${encodeURIComponent(turn.id)}/items?order=asc&limit=100`);
              if (items.has_more) throw new HostedAgentError("invalid_agent_output");
              const messages = items.data.filter(x => x.type === "message" && x.role === "assistant"
                && x.phase === "final_answer" && x.status === "completed" && x.turn_id === turn.id);
              if (messages.length === 1) {
                const content = messages[0].content ?? [];
                if (content.some(x => x.type !== "output_text")) throw new HostedAgentError("invalid_agent_output");
                const text = content.map(x => x.text ?? "").join("");
                try { return Assessment.parse(JSON.parse(text)); }
                catch { throw new HostedAgentError("invalid_agent_output"); }
              }
              if (messages.length > 1) throw new HostedAgentError("invalid_agent_output");
              await pause(timing.pollMs);
            }
            throw new HostedAgentError("agent_output_missing");
          }
        }
        const current = await request<Session>(base);
        if (current.status === "requires_action" || current.required_actions?.length)
          throw new HostedAgentError("unexpected_agent_action");
        if (current.status === "failed") throw new HostedAgentError("agent_failed");
        // An idle session alone does not establish successful completion.
        readFailures = 0;
      } catch (error) {
        if (error instanceof HostedAgentError) throw error;
        if (error instanceof OpenAIHttpError && error.status < 500 && error.status !== 429) throw error;
        if (++readFailures >= 3 || signal.aborted) throw error;
        // Retry observations only; do not create a session or submit another message.
      }
      await pause(timing.pollMs);
    }
    throw new HostedAgentError("agent_timeout");
  } catch (error) {
    const code = error instanceof HostedAgentError ? error.code : signal.aborted ? "agent_timeout"
      : error instanceof OpenAIHttpError && [401, 403].includes(error.status) ? "agent_access_denied" : "agent_unavailable";
    audit.status = "failed"; audit.error_code = code;
    if (audit.session_id && !finished) {
      // Stopping observation does not stop hosted work. Cancel and verify its outcome.
      const cleanup = AbortSignal.timeout(timing.cleanupMs);
      const base = `/agents/sessions/${encodeURIComponent(audit.session_id)}`;
      audit.cancellation = "unconfirmed";
      try {
        await openaiRequest(apiKey, `${base}/events`, { signal: cleanup,
          idempotencyKey: `cancel-${audit.session_id}`,
          body: { events: [{ type: "agent.session.input.cancel" }] } });
        while (!cleanup.aborted) {
          const turns = await openaiRequest<{data: Turn[]}>(apiKey, `${base}/turns?order=asc&limit=2`, {signal:cleanup});
          const turn = turns.data.find(t => !audit.turn_id || t.id === audit.turn_id);
          if (turn) { audit.turn_id = turn.id; audit.agent_id = turn.agent_id; }
          if (turn && terminal(turn.status)) { audit.cancellation = "confirmed"; break; }
          await pause(timing.pollMs);
        }
      } catch { /* Keep IDs and unconfirmed cancellation for audit; never retry inference. */ }
    }
    throw new HostedAgentError(code);
  }
}

import { describe, expect, it, vi } from "vitest";
import { runManagedAgentTurn } from "../lib/order-rescue-v2/agents/session";

function stream(sessionId: string, turnId: string, output: string, calls: Array<{ name: string; call_id: string }> = []) {
  const events = [
    { type: "agent.session.created", session: { id: sessionId, environment: { id: `env_${sessionId}` } } },
    ...calls.map((call) => ({ type: "agent.session.turn.item.added", event_id: `evt_${call.call_id}`, turn_id: turnId, item: { type: "function_call", ...call, turn_id: turnId } })),
    { type: "agent.session.turn.completed", turn: { id: turnId } },
  ];
  return Object.assign((async function* () { yield* events; })(), {
    withResultCollection() { return this; },
    async finalResult() { return { session_id: sessionId, turn_id: turnId, output_text: output }; },
  });
}

describe("managed Agents API session seam", () => {
  it("loads an app skill, calls the Decisions-backed tool, then returns the continued agent result", async () => {
    const decision = {
      decision_id: "dec_hyp_1",
      selected: "CONTACT_ISSUE",
      probabilities: [
        { label: "CONTACT_ISSUE", probability: 0.72 },
        { label: "AVAILABILITY_ISSUE", probability: 0.18 },
        { label: "UNKNOWN_CAUSE", probability: 0.1 },
      ],
      api_confidence: 0.91,
    };
    let request: any;
    const sessions = {
      create: vi.fn(async (body: any) => {
        request = body;
        const toolResult = await body.toolHandlers.evaluate_hypothesis({ snapshot_ref: "snap_1", evidence: [] });
        expect(toolResult).toEqual(decision);
        return stream("sess_live_1", "turn_live_1", "Hypothesis recorded; assessment continued.", [{ name: "evaluate_hypothesis", call_id: "call_decision_1" }]);
      }),
    };
    const onSessionCreated = vi.fn();
    const result = await runManagedAgentTurn({
      sessions: sessions as any,
      model: "gpt-6-astra",
      input: "Assess this synthetic snapshot.",
      skills: [{ name: "investigate-case", description: "Inspect an Order Rescue case.", instructions: "Use current data." }],
      tools: [{
        type: "function", name: "evaluate_hypothesis", description: "Score the cause using Decisions.",
        parameters: { type: "object", properties: { snapshot_ref: { type: "string" }, evidence: { type: "array" } }, required: ["snapshot_ref", "evidence"], additionalProperties: false },
      }],
      handlers: { evaluate_hypothesis: async () => decision },
      onSessionCreated,
    });

    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(request.environment.type).toBe("openai_hosted");
    expect(request.environment.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "inline", name: "investigate-case", source: expect.objectContaining({ type: "base64", media_type: "application/zip" }) }),
    ]));
    expect(atob(request.environment.skills[0].source.data).slice(0, 2)).toBe("PK");
    expect(request.agent.tools.map((tool: any) => tool.name)).toContain("evaluate_hypothesis");
    expect(onSessionCreated).toHaveBeenCalledWith("sess_live_1", "env_sess_live_1");
    expect(request).not.toHaveProperty("spend_control");
    expect(result).toMatchObject({ session_id: "sess_live_1", environment_id: "env_sess_live_1", turn_id: "turn_live_1", output_text: "Hypothesis recorded; assessment continued." });
    expect(result.tool_calls).toEqual(expect.arrayContaining([expect.objectContaining({ name: "evaluate_hypothesis", call_id: "call_decision_1", turn_id: "turn_live_1" })]));
  });

  it("continues an existing durable session with a new snapshot and its registered tool handlers", async () => {
    const sessions = {
      stream: vi.fn(async (sessionId: string, params: any) => {
        expect(sessionId).toBe("sess_reply_1");
        expect(params.input).toContain("snapshot_v2");
        await params.toolHandlers.evaluate_action({ snapshot_ref: "snapshot_v2" });
        return stream(sessionId, "turn_reply_2", "Final proposal ready.");
      }),
    };
    const result = await runManagedAgentTurn({
      sessions: sessions as any, sessionId: "sess_reply_1", model: "gpt-6-astra", input: "Reassess snapshot_v2.",
      handlers: { evaluate_action: async () => ({ decision_id: "dec_action_2", probabilities: [{ label: "ESCALATE_REVIEW", probability: 0.8 }] }) },
    });
    expect(sessions.stream).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ session_id: "sess_reply_1", turn_id: "turn_reply_2" });
  });
});

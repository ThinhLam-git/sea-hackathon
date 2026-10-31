import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { Runner } from "@openai/agents";
import { runManagedAgentTurn } from "../packages/agent/src/runtime/session";
import { Simulator } from "../packages/agent/src/workflow/simulator";
import { workflowData } from "../apps/web/lib/application/v2-workflow-data";
import { scenarios } from "../apps/web/lib/application/v2-evaluator";
import { Decisions } from "openai/resources/decisions";

afterEach(() => vi.restoreAllMocks());

describe("assessment cancellation", () => {
  it("requests documented remote session cancellation when a live turn is interrupted", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const turnStarted = new Promise<void>((resolve) => { started = resolve; });
    const events = { create: vi.fn(async () => undefined) };
    const sessions = {
      events,
      create: vi.fn(async () => Object.assign((async function* () {
        yield { type: "agent.session.created", session: { id: "sess_cancel", environment: null } };
        yield { type: "agent.session.turn.started", turn: { id: "turn_cancel", status: "in_progress" } };
        started();
        await new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve(), { once: true }));
        controller.signal.throwIfAborted();
      })(), { withResultCollection() { return this; }, async finalResult() { return {} as any; } })),
    };
    const statuses: string[] = [];
    const task = runManagedAgentTurn({ sessions: sessions as any, model: "gpt-6-sol", input: "Synthetic cancellation probe.", signal: controller.signal,
      onRemoteCancel: (status) => { statuses.push(status); } });
    await turnStarted;
    controller.abort(new Error("cancel this local stream"));
    await expect(task).rejects.toThrow();
    expect(events.create).toHaveBeenCalledWith("sess_cancel", { events: [{ type: "agent.session.input.cancel" }] }, expect.objectContaining({ maxRetries: 0, timeout: 5000 }));
    expect(statuses).toContain("ACCEPTED");
  });

  it("rejects a late assessment result without committing a stale initial slot", async () => {
    const controller = new AbortController();
    vi.spyOn(Runner.prototype, "run").mockImplementation((async () => {
      controller.abort(new Error("cancel after provider response"));
      return { finalOutput: structuredClone(scenarios[0].expected.initial_assessment) } as any;
    }) as any);
    const decisions = vi.spyOn(Decisions.prototype, "create");
    const sim = new Simulator("LIVE_AI", { openAIClient: new OpenAI({ apiKey: "synthetic-test-key", maxRetries: 0 }),
      agentRuntime: "LEGACY_RESPONSES", assessmentSignal: controller.signal }, workflowData);
    const run = sim.createRun("DEMO-001");
    await expect(sim.assessInitial(run.run_id)).rejects.toBeInstanceOf(Error);
    expect(run.initial_assessment).toBeNull();
    expect(run.current_status).toBe("NEW");
    expect(decisions).not.toHaveBeenCalled();
  });
});

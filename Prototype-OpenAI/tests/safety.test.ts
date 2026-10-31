import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Simulator } from "../lib/order-rescue/simulator.js";

const replay = (id: string) => JSON.parse(readFileSync(new URL(`../fixtures/replay/${id}.json`, import.meta.url), "utf-8"));
const patched = (id: string, key: string, changes: object) => {
  const store = replay(id);
  Object.assign(store[key].output, changes);
  return store;
};
const start = (id: string, store: object) => new Simulator("REPLAY", { [id]: store }).start(id);

describe("AI output is checked by code, policy always wins", () => {
  it("rejects an action outside the schema", async () => {
    const [, d] = await start("OR-001", patched("OR-001", "START", { candidate_action: "AUTO_REFUND" }));
    expect([d.policy_gate, d.rules]).toEqual(["ESCALATED", ["AI:invalid_model_output"]]);
  });

  it("rejects an invented source ref", async () => {
    const store = replay("OR-001");
    store.START.output.evidence[0].source_ref = "OR-001-FAKE";
    expect((await start("OR-001", store))[1].rules).toEqual(["AI:invalid_evidence_reference"]);
  });

  it("rejects a quote that is not in the source", async () => {
    const store = replay("OR-001");
    store.START.output.evidence[1].quote = "Khách nói không cần nữa";
    expect((await start("OR-001", store))[1].rules).toEqual(["AI:unsupported_claim"]);
  });

  it("high confidence never overrides policy", async () => {
    const [, d] = await start("OR-001", patched("OR-001", "START",
      { confidence: "HIGH", candidate_action: "STANDARD_REATTEMPT", buyer_intent: "WANTS", availability: "CONFIRMED" }));
    expect(d.agent!.confidence).toBe("MEDIUM");
    expect(d.final_action).toBe("ESCALATE_REVIEW");
    expect(d.rules).toContain("R05:intent");
  });

  it("refuses a reply to a question that was never asked", async () => {
    const sim = new Simulator("REPLAY", { "OR-001": patched("OR-001", "START", { candidate_action: "ESCALATE_REVIEW", question_key: null }) });
    const [run] = await sim.start("OR-001");
    await expect(sim.applyEvent(run.run_id, "OR-001-EV1")).rejects.toThrow();
  });

  it("escalates on reply timeout without blaming the buyer (R13)", async () => {
    const sim = new Simulator();
    const [run, first] = await sim.start("OR-001");
    expect(first.record_status).toBe("PENDING");
    const [d] = await sim.advance(run.run_id, 240);
    expect(d.final_action).toBe("ESCALATE_REVIEW");
    expect(d.rules).toContain("R13");
  });

  it("holds a verified disruption until reassessment", async () => {
    const [, d] = await new Simulator().start("OR-038");
    expect([d.final_action, d.record_status, d.reassess_at]).toEqual(["HOLD_DISRUPTION", "PENDING", "2026-10-16T17:00:00+07:00"]);
  });

  it("goes to Ops when LIVE_AI has no API key", async () => {
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const [, d] = await new Simulator("LIVE_AI").start("OR-001");
    if (key) process.env.OPENAI_API_KEY = key;
    expect(d.rules).toEqual(["AI:model_unavailable"]);
  });

  it("ignores duplicate events", async () => {
    const sim = new Simulator();
    const [run] = await sim.start("OR-001");
    expect(await sim.applyEvent(run.run_id, "OR-001-EV1")).not.toBeNull();
    expect(await sim.applyEvent(run.run_id, "OR-001-EV1")).toBeNull();
  });
});

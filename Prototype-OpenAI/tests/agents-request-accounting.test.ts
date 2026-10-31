import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { requestDecision } from "../packages/agent/src/decisions/request";
import { evaluateHypothesisDecision } from "../packages/agent/src/decisions";
import { HYPOTHESES } from "../packages/agent/src/models";

afterEach(() => vi.restoreAllMocks());

const request = { model: "gpt-6-luna", input: [], questions: [] } as any;
const choiceResponse = {
  model: "gpt-6-luna",
  _request_id: "req_ok",
  usage: { input_tokens: 25, output_tokens: 6 },
  answers: [{ type: "choice", name: "hypothesis", choice: "AVAILABILITY_ISSUE", confidence: 0.9,
    probabilities: HYPOTHESES.map((value) => ({ value, probability: value === "AVAILABILITY_ISSUE" ? 1 : 0 })) }],
};

describe("Decisions request ledger", () => {
  it("checkpoints a failed provider attempt before dispatch and stores sanitized failure details", async () => {
    const client = new OpenAI({ apiKey: "synthetic-test-key", maxRetries: 0 });
    const failure = Object.assign(new Error("provider error body must not persist"), { status: 429, code: "rate_limit_exceeded", request_id: "req_failed", body: { message: "SECRET BODY" } });
    const create = vi.spyOn(client.decisions, "create").mockRejectedValue(failure as any);
    const recorded: any[] = [];
    await expect(requestDecision(client, request, "hypothesis_selection", "gpt-6-luna", {
      execution_id: "exec_failed", snapshot_hash: "snapshot_1", phase: "INITIAL", onAttempt: (entry) => { recorded.push(structuredClone(entry)); },
    }, (response) => response)).rejects.toBe(failure);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[1]).toMatchObject({ maxRetries: 0, timeout: 15000 });
    expect(recorded).toHaveLength(2);
    expect(recorded[0]).toMatchObject({ status: "IN_PROGRESS", purpose: "hypothesis_selection", execution_id: "exec_failed", snapshot_hash: "snapshot_1", requested_model: "gpt-6-luna" });
    expect(recorded[1]).toMatchObject({ status: "ERROR", failure_category: "rate_limit", request_id: "req_failed", returned_model: null, usage: { available: false, reason: "provider_no_response" } });
    expect(recorded[1].latency_ms).toEqual(expect.any(Number));
    expect(JSON.stringify(recorded)).not.toContain("SECRET BODY");
    expect(JSON.stringify(recorded)).not.toContain("provider error body");
  });

  it("does not dispatch a new Decisions request after shared cancellation", async () => {
    const client = new OpenAI({ apiKey: "synthetic-test-key", maxRetries: 0 });
    const controller = new AbortController(); controller.abort(new Error("cancelled"));
    const create = vi.spyOn(client.decisions, "create");
    const recorded: any[] = [];
    await expect(requestDecision(client, request, "hypothesis_selection", "gpt-6-luna", {
      execution_id: "exec_cancelled", snapshot_hash: "snapshot_2", phase: "INITIAL", signal: controller.signal,
      onAttempt: (entry) => { recorded.push(entry); },
    }, (response) => response)).rejects.toThrow("cancelled");
    expect(create).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
  });

  it("marks a response ambiguous after cancellation and stops before the next Decisions request", async () => {
    const client = new OpenAI({ apiKey: "synthetic-test-key", maxRetries: 0 });
    const controller = new AbortController(), recorded: any[] = [];
    const create = vi.spyOn(client.decisions, "create").mockImplementation((async () => {
      controller.abort(new Error("assessment cancelled"));
      return choiceResponse as any;
    }) as any);
    await expect(evaluateHypothesisDecision(client, {
      snapshot: { case_id: "SYNTHETIC" },
      evidence: [{ source_ref: "EV-1", fact: "Synthetic evidence.", verification: "SOURCE_RECORD" }],
      request_context: { execution_id: "exec_late", snapshot_hash: "snapshot_3", phase: "INITIAL", signal: controller.signal,
        onAttempt: (entry) => { recorded.push(structuredClone(entry)); } },
    })).rejects.toThrow("assessment cancelled");
    expect(create).toHaveBeenCalledTimes(1);
    expect(recorded.at(-1)).toMatchObject({ status: "AMBIGUOUS", failure_category: "cancelled", usage: { available: true, value: choiceResponse.usage } });
    expect(recorded.filter((entry) => entry.attempt_id)).toHaveLength(2);
  });
});

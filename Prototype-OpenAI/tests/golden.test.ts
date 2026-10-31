import { describe, expect, it } from "vitest";
import { play } from "../lib/order-rescue/cli.js";
import { compare } from "../lib/order-rescue/golden.js";
import { Simulator } from "../lib/order-rescue/simulator.js";
import { PIPELINE } from "../lib/order-rescue/pipeline.js";

const CASES = new Simulator().listCases().map((c) => c.case_id);

describe("sheet v0.5 golden, OpenAI pipeline", () => {
  it("imports 25 cases and a 7-step workflow", () => {
    expect(CASES).toHaveLength(25);
    expect(PIPELINE.map(([n]) => n)).toEqual(["load-case", "prepare-input", "assess-case", "validate-output",
      "policy-gate", "compose-recommendation", "audit-log"]);

  });

  it.each(CASES)("%s matches golden", async (caseId) => {
    const { c, decision } = await play(new Simulator(), caseId);
    expect(compare(c, decision).filter((r) => !r.ok)).toEqual([]);
    expect(decision.workflow_execution_id).toBeTruthy();
  });

  it("pre-AI cases have no agent output", async () => {
    for (const id of ["OR-011", "OR-015", "OR-047", "OR-049", "OR-050", "OR-051", "OR-052", "OR-055"]) {
      const { decision } = await play(new Simulator(), id);
      expect(decision.agent).toBeNull();
      expect(decision.skills_run).not.toContain("assess-case");
    }
  });
});

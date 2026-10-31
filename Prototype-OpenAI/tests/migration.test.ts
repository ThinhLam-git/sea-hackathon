import { describe, expect, it } from "vitest";
import { Simulator } from "../lib/order-rescue/simulator";
import { policy, replays } from "../lib/order-rescue/fixtures";
import { run as prepare } from "../lib/order-rescue/skills/prepare-input/skill";
import { createAssessmentAgent } from "../lib/order-rescue/skills/assess-case/skill";
import type { PipelineState } from "../lib/order-rescue/models";

describe("OpenAI migration preserves the delivery contract", () => {
 it("keeps the agent tool-free and typed", () => {
  const agent=createAssessmentAgent();
  expect(agent.tools).toEqual([]); expect(agent.handoffs).toEqual([]);
  expect(agent.outputType).toBeTruthy(); expect(agent.modelSettings.store).toBe(false);
 });
 it("excludes golden answers, titles and future replies from model input",async()=>{
  const sim=new Simulator(),[run]=await sim.start("OR-001");
  const state={run,policy} as PipelineState;
  const snapshot=prepare(state).snapshot,serialized=JSON.stringify(snapshot);
  expect(snapshot).not.toHaveProperty("evidence");
  for(const forbidden of ["expected","golden",run.case.title,"OR-001-EV1"])expect(serialized).not.toContain(forbidden);
 });
 it("rejects missing replay instead of silently switching modes",async()=>{
  const [,d]=await new Simulator("REPLAY",{"OR-001":{}}).start("OR-001");
  expect(d.final_action).toBe("ESCALATE_REVIEW");expect(d.rules).toContain("AI:replay_missing");
 });
 it("rejects replay from another prompt version",async()=>{
  const replay=structuredClone(replays["OR-001"]);replay.START.prompt_version="old";
  const [,d]=await new Simulator("REPLAY",{"OR-001":replay}).start("OR-001");
  expect(d.rules).toContain("AI:replay_version_mismatch");
 });
 it("preserves earlier decisions when new information arrives",async()=>{
  const sim=new Simulator(),[run]=await sim.start("OR-001"),first=JSON.stringify(sim.history(run.run_id)[0]);
  await sim.applyEvent(run.run_id,"OR-001-EV1");
  expect(JSON.stringify(sim.history(run.run_id)[0])).toBe(first);expect(sim.history(run.run_id)).toHaveLength(2);
  expect(sim.history(run.run_id)[1].snapshot_source_refs).toContain("OR-001-EV1");
 });
 it("keeps both policy gates and audit after a pre-AI halt",async()=>{
  const [,d]=await new Simulator().start("OR-051");
  expect(d.skills_run).toEqual(["load-case","policy-gate","compose-recommendation","audit-log"]);expect(d.agent).toBeNull();
 });
 it("does not turn back the virtual clock",async()=>{
  const sim=new Simulator(),[run]=await sim.start("OR-001");
  await expect(sim.advance(run.run_id,-60)).rejects.toThrow();
 });
});

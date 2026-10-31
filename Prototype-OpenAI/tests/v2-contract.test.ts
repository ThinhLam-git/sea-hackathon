import { afterEach, describe, expect, it, vi } from "vitest";
import { Simulator, TransitionError } from "../lib/order-rescue-v2/simulator";
import { scenarios } from "../lib/order-rescue-v2/evaluator";
import { loadCase, caseIds } from "../lib/order-rescue-v2/fixtures";
import { run as prepare } from "../lib/order-rescue-v2/skills/prepare-input/skill";
import type { PipelineState } from "../lib/order-rescue-v2/models";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("v2.2 two-assessment contract",()=>{
 it.each(scenarios.map(c=>[c.case_id,c] as const))("runs %s against the supplied draft behavior fixture",async(id,c)=>{
  const sim=new Simulator(),[run,initial]=await sim.start(id),before=JSON.stringify(initial);
  const a=c.expected.initial_assessment;
  expect(initial.agent).toEqual(a);expect(initial.final_action).toBe(c.expected.initial_policy_output.final_action);
  expect(run.current_status).toBe("WAITING_FOR_BUYER");expect(run.question_wait_state?.question_key).toBe(a.question_key);
  const q=run.question_wait_state!.question_id,event=crypto.randomUUID();
  if(c.simulation.buyer_reply)await sim.recordBuyerReply(run.run_id,c.simulation.buyer_reply,event,q);
  else sim.noReply(run.run_id,event,q);
  expect(run.current_status).toBe("COMPLETED");expect(run.final_assessment_source).toBe(c.expected.final_assessment_source);
  expect(run.after_reply_assessment).toEqual(c.expected.after_reply_assessment);
  expect(run.final_assessment).toEqual(c.expected.final_assessment);
  expect(run.final_policy_output?.final_action).toBe(c.expected.final_policy_output.final_action);
  expect(run.final_policy_output?.policy_gate).toBe(c.expected.final_policy_output.policy_gate);
  expect(JSON.stringify(sim.history(run.run_id)[0])).toBe(before);
 });
 it("keeps initial input isolated from all draft answers and future replies",async()=>{
  const sim=new Simulator(),[run]=await sim.start("DEMO-001"),state=prepare({run} as PipelineState),body=JSON.stringify(state.snapshot);
  expect(state.snapshot.runtime_context).toEqual([]);expect(Object.keys(state.snapshot.core_input)).toHaveLength(7);
  for(const bad of ["expected","simulation","after_reply_assessment","DEMO-001-REPLY",scenarios[0].simulation.buyer_reply!])expect(body).not.toContain(bad);
 });
 it("selects initial on manual no-reply without inference, a timer, or a synthetic buyer refusal",async()=>{
  const sim=new Simulator(),[run]=await sim.start("DEMO-005"),now=run.now,initial=JSON.stringify(run.initial_assessment);
  const transport=vi.fn();vi.stubGlobal("fetch",transport);const id=crypto.randomUUID(),q=run.question_wait_state!.question_id;
  sim.noReply(run.run_id,id,q);expect(sim.noReply(run.run_id,id,q)).toBeNull();
  expect(run.now).toBe(now);expect(run.after_reply_assessment).toBeNull();expect(JSON.stringify(run.final_assessment)).toBe(initial);
  expect(run.final_policy_output?.final_action).toBe("CLARIFY");expect(run.question_wait_state?.status).toBe("NO_REPLY");expect(run.applied).toEqual([]);
  expect(transport).not.toHaveBeenCalled();expect(sim.history(run.run_id)).toHaveLength(2);
  await expect(sim.recordBuyerReply(run.run_id,"Reply",crypto.randomUUID(),q,true)).rejects.toThrow("finalized");
 });
 it("binds one reply to the actual question and rejects conflicting retries",async()=>{
  const sim=new Simulator(),[run]=await sim.start("DEMO-001"),text=scenarios[0].simulation.buyer_reply!,event=crypto.randomUUID(),q=run.question_wait_state!.question_id;
  await expect(sim.recordBuyerReply(run.run_id,text,event,"wrong-question")).rejects.toThrow("question_mismatch");
  expect(run.applied).toHaveLength(0);await sim.recordBuyerReply(run.run_id,text,event,q);
  expect(await sim.recordBuyerReply(run.run_id,text,event,q)).toBeNull();
  await expect(sim.recordBuyerReply(run.run_id,text,event,"changed-question")).rejects.toThrow("event_conflict");
  await expect(sim.recordBuyerReply(run.run_id,"Changed text",event,q)).rejects.toThrow("event_conflict");
  expect(()=>sim.noReply(run.run_id,crypto.randomUUID(),q)).toThrow("finalized");
  expect(sim.history(run.run_id)).toHaveLength(2);
 });
 it("rejects arbitrary text in Replay without an explicit live assessment",async()=>{
  const sim=new Simulator(),[run]=await sim.start("DEMO-001");
  await expect(sim.recordBuyerReply(run.run_id,"Custom text",crypto.randomUUID(),run.question_wait_state!.question_id)).rejects.toBeInstanceOf(TransitionError);
  expect(run.applied).toHaveLength(0);expect(sim.mode).toBe("REPLAY");
 });
 it.each(["STARTED","COMPLETED"] as const)("blocks return state %s before any model call",async(value)=>{
  const c=loadCase("DEMO-001");c.input.return_state=value;
  const transport=vi.fn();vi.stubGlobal("fetch",transport);
  const [run,d]=await new Simulator("LIVE_AI",{apiKey:"test-key"}).start(c.case_id,c);
  expect(d.policy_gate).toBe("BLOCKED");expect(run.current_status).toBe("COMPLETED");expect(run.question_wait_state).toBeNull();
  expect(transport).not.toHaveBeenCalled();
 });
 it("loads 30 raw seed cases without inventing buyer history",()=>{
  expect(caseIds).toHaveLength(30);for(const id of caseIds){const c=loadCase(id);expect(c.input.buyer_history).toEqual([]);expect(c).not.toHaveProperty("expected");expect(c.sources.every(s=>s.phase==="T0")).toBe(true);}
 });
});

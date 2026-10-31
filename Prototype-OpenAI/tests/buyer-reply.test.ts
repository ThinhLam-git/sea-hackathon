import { afterEach, describe, expect, it, vi } from "vitest";
import { Runner } from "@openai/agents";
import { Decisions } from "openai/resources/decisions";
import { Simulator } from "../lib/order-rescue/simulator";
import { runView } from "../lib/order-rescue/view";
import { Assessment, sourceText } from "../lib/order-rescue/models";
import { replays } from "../lib/order-rescue/fixtures";

const eventId = "ca2dabcc-baa0-4ad2-813d-57bcc1709870";
const custom = "Tôi muốn nhận hàng. Ngày mai có người ở nhà nhận giúp.";
const score = {answers:[{type:"score",name:"evidence_support",score:1.9,confidence:.8,probabilities:[{value:0,label:"LOW",probability:0},{value:1,label:"MEDIUM",probability:.1},{value:2,label:"HIGH",probability:.9}]}]};
afterEach(()=>vi.restoreAllMocks());

describe("staff records a buyer response",()=>{
 it("does not accept a response before an approved question",async()=>{
  const sim=new Simulator(),[run]=await sim.start("OR-051");
  await expect(sim.recordBuyerReply(run.run_id,custom,eventId,true)).rejects.toThrow("not_asked");
  expect(run.applied).toHaveLength(0);expect(sim.history(run.run_id)).toHaveLength(1);
 });
 it("uses the original prepared replay without an API call",async()=>{
  const assessor=vi.spyOn(Runner.prototype,"run"),scorer=vi.spyOn(Decisions.prototype,"create");
  const sim=new Simulator(),[run]=await sim.start("OR-001");
  const text=sourceText(run.case.sources.find(s=>s.source_ref==="OR-001-EV1")!);
  const next=await sim.recordBuyerReply(run.run_id,text,eventId);
  expect(next?.final_action).toBe("STANDARD_REATTEMPT");expect(sim.mode).toBe("REPLAY");
  expect(assessor).not.toHaveBeenCalled();expect(scorer).not.toHaveBeenCalled();
  expect(await sim.recordBuyerReply(run.run_id,text,eventId)).toBeNull();expect(sim.history(run.run_id)).toHaveLength(2);
 });
 it("requires explicit live use for custom text without mutating a replay",async()=>{
  const sim=new Simulator(),[run]=await sim.start("OR-001");
  await expect(sim.recordBuyerReply(run.run_id,custom,eventId)).rejects.toThrow("live_required");
  expect(run.applied).toHaveLength(0);expect(sim.mode).toBe("REPLAY");expect(sim.history(run.run_id)).toHaveLength(1);
 });
 it("assesses a custom response in the same run and keeps retries idempotent",async()=>{
  const sim=new Simulator("REPLAY",{},{apiKey:"test-key"}),[run,first]=await sim.start("OR-001"),original=JSON.stringify(first);
  const output=Assessment.parse(replays["OR-001"]["START+OR-001-EV1"].output);
  for(const evidence of output.evidence)if(evidence.source_ref==="OR-001-EV1"){evidence.source_ref=`OR-001-REPLY-${eventId}`;evidence.quote=custom;}
  const assessor=vi.spyOn(Runner.prototype,"run").mockResolvedValue({finalOutput:output} as any);
  const scorer=vi.spyOn(Decisions.prototype,"create").mockResolvedValue(score as any);
  const next=await sim.recordBuyerReply(run.run_id,custom,eventId,true);
  expect(next?.final_action).toBe("STANDARD_REATTEMPT");expect(next?.confidence_score?.source).toBe("openai_decisions");
  expect(sim.mode).toBe("LIVE_AI");expect(run.questions_asked).toBe(1);expect(run.replied_after_question).toBe(true);
  expect(run.applied.at(-1)).toMatchObject({source_type:"BUYER_REPLY",actor:"buyer_recorded_by_staff",content:{text:custom}});
  expect(JSON.stringify(sim.history(run.run_id)[0])).toBe(original);expect(sim.history(run.run_id)).toHaveLength(2);
  expect(runView(sim,run.run_id).events.filter(e=>e.type==="BUYER_REPLY").every(e=>!e.available)).toBe(true);
  expect(await sim.recordBuyerReply(run.run_id,custom,eventId,true)).toBeNull();
  await expect(sim.recordBuyerReply(run.run_id,"Different text",eventId,true)).rejects.toThrow("event_conflict");
  await expect(sim.recordBuyerReply(run.run_id,custom,crypto.randomUUID(),true)).rejects.toThrow("already_recorded");
  expect(assessor).toHaveBeenCalledTimes(1);expect(scorer).toHaveBeenCalledTimes(1);
 });
 it("rejects empty, oversized and expired replies",async()=>{
  const sim=new Simulator(),[run]=await sim.start("OR-001");
  for(const text of [" ","x".repeat(2001)])await expect(sim.recordBuyerReply(run.run_id,text,eventId)).rejects.toThrow("invalid_reply");
  await sim.advance(run.run_id,240);
  await expect(sim.recordBuyerReply(run.run_id,custom,eventId,true)).rejects.toThrow("timed_out");
  expect(run.applied.every(s=>s.source_type!=="BUYER_REPLY")).toBe(true);
 });
});

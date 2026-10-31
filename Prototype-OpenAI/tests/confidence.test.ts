import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { Decisions } from "openai/resources/decisions";
import { Runner } from "@openai/agents";
import { Assessment } from "../lib/order-rescue/models";
import { replays, policy } from "../lib/order-rescue/fixtures";
import { Simulator } from "../lib/order-rescue/simulator";
import { run as prepare } from "../lib/order-rescue/skills/prepare-input/skill";
import { CONFIDENCE_MODEL, parseConfidence, scoreConfidence } from "../lib/order-rescue/confidence";
import type { PipelineState } from "../lib/order-rescue/models";

const response=(value=1.9)=>({model:CONFIDENCE_MODEL,answers:[{type:"score",name:"evidence_support",score:value,confidence:.85,
 probabilities:[{value:0,label:"LOW",probability:value<1?1-value:0},{value:1,label:"MEDIUM",probability:value<1?value:2-value},{value:2,label:"HIGH",probability:value<1?0:value-1}]}]});
const assessment=()=>Assessment.parse(replays["OR-001"].START.output);
function mockLive(output=assessment(), scored:unknown=response()){
 const assessor=vi.spyOn(Runner.prototype,"run").mockResolvedValue({finalOutput:output} as any);
 const scorer=vi.spyOn(Decisions.prototype,"create").mockResolvedValue(scored as any);
 return {assessor,scorer,sim:new Simulator("LIVE_AI",{}, {apiKey:"test-key"})};
}
afterEach(()=>vi.restoreAllMocks());

describe("Decisions confidence integration",()=>{
 it("uses rubric support, separately from the API's own certainty",()=>{
  const result=parseConfidence(response(.6));
  expect(result.score).toBe(30);expect(result.level).toBe("MEDIUM");
  expect(result.scorer_confidence).toBe(.85);expect(result.rubric_score).toBe(.6);
 });
 it.each([
  {answers:[]},
  {answers:[{...response().answers[0],score:3}]},
  {answers:[{...response().answers[0],score:.1}]},
  {answers:[{...response().answers[0],probabilities:[{value:0,label:"LOW",probability:1}]}]},
  {answers:[{...response().answers[0],name:"other_question"}]},
  {answers:[{...response().answers[0],probabilities:response().answers[0].probabilities.map(p=>({...p,label:"wrong"}))}]},
 ])("rejects malformed or inconsistent scorer responses",bad=>{
  expect(()=>parseConfidence(bad)).toThrow("invalid_confidence_output");
 });
 it("sends only the current snapshot and an untrusted proposal, without self-confidence or golden answers",async()=>{
  const sim=new Simulator(),[run]=await sim.start("OR-001");
  const snapshot=prepare({run,policy} as PipelineState).snapshot;
  const call=vi.spyOn(Decisions.prototype,"create").mockResolvedValue(response(.6) as any);
  await scoreConfidence(new OpenAI({apiKey:"test-key"}),snapshot,assessment());
  const request=call.mock.calls[0][0];
  expect(request.model).toBe("gpt-6-luna");expect(request.questions[0].type).toBe("score");
  const content=(request.input as any[])[0].content[0];
  expect(content.type).toBe("input_json");expect(content.data.proposal).not.toHaveProperty("confidence");
  const serialized=JSON.stringify(request);
  for(const forbidden of ["expected","golden",run.case.title,"OR-001-EV1","test-key"])expect(serialized).not.toContain(forbidden);
 });
 it("caps high numerical scores and keeps missing buyer confirmation in the policy gate",async()=>{
  const output=assessment();output.evidence=output.evidence.filter(e=>e.source_ref==="OR-001-NOTE");
  Object.assign(output,{candidate_action:"STANDARD_REATTEMPT",buyer_intent:"WANTS",availability:"CONFIRMED"});
  const {sim,assessor,scorer}=mockLive(output);
  const [,d]=await sim.start("OR-001");
  expect(assessor).toHaveBeenCalledTimes(1);expect(scorer).toHaveBeenCalledTimes(1);
  expect(d.confidence_score).toMatchObject({raw_score:95,score:74,level:"MEDIUM",capped:true,source:"openai_decisions"});
  expect(d.agent?.confidence).toBe("MEDIUM");expect(d.rules).toContain("R05:intent");expect(d.final_action).toBe("ESCALATE_REVIEW");
 });
 it("invalidates a score when the cited evidence fails validation",async()=>{
  const output=assessment();output.evidence[0].source_ref="MADE-UP";
  const {sim}=mockLive(output);const [,d]=await sim.start("OR-001");
  expect(d.rules).toContain("AI:invalid_evidence_reference");expect(d.confidence_score).toBeUndefined();
  expect(d.model_info.confidence_scoring.status).toBe("invalidated");
 });
 it("routes scorer refusals to operations with no confidence fallback",async()=>{
  const {sim}=mockLive(assessment(),{answers:[{type:"refusal",name:"evidence_support"}]});
  const [,d]=await sim.start("OR-001");
  expect(d.rules).toContain("AI:confidence_refused");expect(d.final_action).toBe("ESCALATE_REVIEW");
  expect(d.agent).toBeNull();expect(d.confidence_score).toBeUndefined();
 });
 it("routes scorer outages to operations without logging provider error contents",async()=>{
  const {sim,scorer}=mockLive();scorer.mockRejectedValue(new Error("do-not-log-this-detail"));
  const [,d]=await sim.start("OR-001");
  expect(d.rules).toContain("AI:confidence_unavailable");expect(d.agent).toBeNull();
  expect(JSON.stringify(d)).not.toContain("do-not-log-this-detail");
 });
 it("keeps replay honest and skips both API calls for cases stopped before assessment",async()=>{
  const {assessor,scorer,sim}=mockLive();
  const [,replay]=await new Simulator().start("OR-001");
  expect(replay.agent?.confidence).toBe("MEDIUM");expect(replay.confidence_score).toBeUndefined();
  const [,blocked]=await sim.start("OR-051");
  expect(blocked.agent).toBeNull();expect(assessor).not.toHaveBeenCalled();expect(scorer).not.toHaveBeenCalled();
 });
 it("records the score with each decision without rewriting earlier scores",async()=>{
  const {sim,assessor,scorer}=mockLive(assessment(),response(.6));
  const [run,first]=await sim.start("OR-001");const original=JSON.stringify(first);
  const reply=Assessment.parse(replays["OR-001"]["START+OR-001-EV1"].output);
  assessor.mockResolvedValue({finalOutput:reply} as any);scorer.mockResolvedValue(response(1.9) as any);
  const next=await sim.applyEvent(run.run_id,"OR-001-EV1");
  expect(next?.final_action).toBe("STANDARD_REATTEMPT");expect(next?.confidence_score?.score).toBe(95);
  expect(JSON.stringify(sim.history(run.run_id)[0])).toBe(original);expect(sim.history(run.run_id)).toHaveLength(2);
 });
});

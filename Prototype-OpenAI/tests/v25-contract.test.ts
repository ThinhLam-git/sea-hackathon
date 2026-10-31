import { describe, expect, it } from "vitest";
import { Assessment, CONTRACT_VERSION, focusedQuestion } from "../lib/order-rescue-v2/models";
import { Simulator } from "../lib/order-rescue-v2/simulator";
import { runView } from "../lib/order-rescue-v2/view";
import { run as prepare } from "../lib/order-rescue-v2/skills/prepare-input/skill";
import { run as policy } from "../lib/order-rescue-v2/skills/policy-gate/skill";
import type { PipelineState } from "../lib/order-rescue-v2/models";

describe("v2.5 output contract",()=>{
 it("permits a sourced T0 confirmation without requiring another contact",async()=>{
  const [r,d]=await new Simulator().start("DEMO-001");
  const ref="DEMO-001-BUYER-T0-TEST";
  r.case.sources.push({source_ref:ref,phase:"T0",source_type:"BUYER_MESSAGE",actor:"buyer",occurred_at:r.now,content:{text:"Tôi vẫn muốn nhận, mai có người ở nhà nhận."}});
  const a={...d.agent!,missing_info:[],question_key:null,candidate_action:"STANDARD_REATTEMPT" as const,evidence:[{source_ref:ref,fact:"Buyer xác nhận muốn nhận và mai có người nhận.",verification:"DIRECT_BUYER_STATEMENT" as const}]};
  const s=prepare({run:r,assessment:a,stage:"INITIAL",rules:[]} as unknown as PipelineState);
  expect(policy(s).result?.final_action).toBe("STANDARD_REATTEMPT");
  r.case.sources.at(-1)!.occurred_at=new Date(Date.parse(r.now)+60000).toISOString();
  const future=prepare({run:r,assessment:a,stage:"INITIAL",rules:[]} as unknown as PipelineState);
  expect(policy(future).result?.policy_gate).toBe("BLOCKED");
 });
 it("blocks an AI retry proposal while a verified disruption remains active",async()=>{
  const [r,d]=await new Simulator().start("DEMO-023");
  const s=prepare({run:r,assessment:{...d.agent!,candidate_action:"STANDARD_REATTEMPT"},stage:"INITIAL",rules:[]} as unknown as PipelineState);
  expect(policy(s).result).toMatchObject({policy_gate:"BLOCKED",final_action:"ESCALATE_REVIEW"});
 });
 it.each(["DEMO-023","DEMO-025","DEMO-026"])("preserves all rescue gaps despite immediately escalating %s",async id=>{
  const [r,d]=await new Simulator().start(id);
  expect(r.contract_version).toBe("2.5");expect(d.agent?.missing_info).toEqual(["CURRENT_BUYER_INTENT","RECEIVING_AVAILABILITY","LOGISTICS_VERIFICATION"]);
  expect(d.agent?.question_key).toBeNull();expect(d.question_text).toBeNull();expect(d.final_action).toBe("ESCALATE_REVIEW");
  expect(r.after_reply_assessment).toBeNull();
 });
 it("rejects retired HOLD as a new model candidate",async()=>{
  const [,d]=await new Simulator().start("DEMO-001");
  expect(Assessment.safeParse({...d.agent,candidate_action:"HOLD_DISRUPTION"}).success).toBe(false);
 });
 it.each(["2.2","2.4"] as const)("does not project new golden labels or reply controls onto v%s history",async version=>{
  const sim=new Simulator(),[r]=await sim.start("DEMO-001");r.contract_version=version;
  const d=sim.history(r.run_id)[0];d.policy_version=`historical-${version}`;d.final_action="HOLD_DISRUPTION";
  const v=runView(sim,r.run_id);
  expect(v.read_only).toBe(true);expect(v.expected).toBeNull();expect(v.golden).toEqual([]);expect(v.events).toEqual([]);
  expect(v.ground_truth_status).toBe("HISTORICAL");expect(v.history[0].final_action).toBe("HOLD_DISRUPTION");expect(v.history[0].policy_version).toBe(`historical-${version}`);
  expect(r.contract_version).not.toBe(CONTRACT_VERSION);
 });
 it.each(["DEMO-017","DEMO-018"])("asks one current-intent fact for %s instead of assuming acceptance",async id=>{
  const [,d]=await new Simulator().start(id);
  expect(focusedQuestion(d.agent!)).toBe("Hiện bạn còn muốn nhận đơn này không?");
 });
 it("uses the broad address key to ask the unresolved cause rather than assuming a missing landmark",async()=>{
  const [,d]=await new Simulator().start("DEMO-007");
  expect(d.agent?.question_key).toBe("CLARIFY_LANDMARK");
  expect(focusedQuestion(d.agent!)).toBe("Lần giao trước bạn gặp trở ngại gì tại điểm nhận đã đăng ký?");
 });
});

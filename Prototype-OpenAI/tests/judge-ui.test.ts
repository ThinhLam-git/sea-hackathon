import {describe,expect,it} from "vitest";
import {Simulator} from "../lib/order-rescue-v2/simulator";
import {runView} from "../lib/order-rescue-v2/view";
import {decisionPresentation,submissionUsesLive} from "../features/judge-demo/presentation";

describe("Lucas UI adapter uses backend outcomes",()=>{
 it("shows a real hold while a buyer question is pending",async()=>{
  const sim=new Simulator(),[r]=await sim.start("DEMO-023"),view=runView(sim,r.run_id);
  expect(view.lifecycle).toBe("WAITING_FOR_BUYER");
  expect(decisionPresentation(view)).toMatchObject({tone:"hold",title:"Tạm giữ vì gián đoạn vận hành"});
 });
 it("does not label an insufficient buyer reply as a successful retry",async()=>{
  const sim=new Simulator(),[r]=await sim.start("DEMO-030");const view=runView(sim,r.run_id),sample=view.events[0];
  await sim.recordBuyerReply(r.run_id,sample.text,crypto.randomUUID(),r.question_wait_state!.question_id);
  expect(decisionPresentation(runView(sim,r.run_id))).toMatchObject({tone:"review",title:"Chuyển Ops xem xét"});
 });
 it("shows unresolved human review when no reply retains initial CLARIFY",async()=>{
  const sim=new Simulator(),[r]=await sim.start("DEMO-001");
  sim.noReply(r.run_id,crypto.randomUUID(),r.question_wait_state!.question_id);
  const view=runView(sim,r.run_id);expect(view.history.at(-1)?.final_action).toBe("CLARIFY");
  expect(decisionPresentation(view)).toMatchObject({tone:"review",label:"Giữ đánh giá ban đầu"});
  expect(view.assessment_slots.after_reply).toBeNull();
 });
 it("labels a validated retry from the final backend decision",async()=>{
  const sim=new Simulator(),[r]=await sim.start("DEMO-001"),sample=runView(sim,r.run_id).events[0];
  await sim.recordBuyerReply(r.run_id,sample.text,crypto.randomUUID(),r.question_wait_state!.question_id);
  expect(decisionPresentation(runView(sim,r.run_id))).toMatchObject({tone:"retry",title:"Đề xuất giao lại tiêu chuẩn"});
 });
 it("keeps only the exact available sample in Replay and explicitly sends custom text live",async()=>{
  const sim=new Simulator(),[r]=await sim.start("DEMO-001"),view=runView(sim,r.run_id),sample=view.events[0].text;
  expect(submissionUsesLive(view,sample)).toBe(false);expect(submissionUsesLive(view,`  ${sample}  `)).toBe(false);
  expect(submissionUsesLive(view,"Tôi muốn đổi địa chỉ.")).toBe(true);
  expect(submissionUsesLive({...view,mode:"LIVE_AI"},sample)).toBe(true);
 });
});

describe("interface languages preserve backend decisions",()=>{
 it("translates controls and approved question copy without changing source text",async()=>{
  const {translate}=await import("../features/judge-demo/i18n");
  expect(translate("Không có phản hồi","en")).toBe("No reply");
  expect(translate("Không có phản hồi","vi")).toBe("Không có phản hồi");
  expect(translate("a buyer’s original statement","en")).toBe("a buyer’s original statement");
 });
 it("explains an actual hold rule in English without changing the saved policy",async()=>{
  const {policyReason}=await import("../features/judge-demo/policy-copy");
  const sim=new Simulator(),[r]=await sim.start("DEMO-023"),d=runView(sim,r.run_id).history[0],before=JSON.stringify(d);
  expect(policyReason(d,"en")).toContain("buyer reply cannot clear it");
  expect(policyReason(d,"vi")).toBe(d.reason);expect(JSON.stringify(d)).toBe(before);
 });
});

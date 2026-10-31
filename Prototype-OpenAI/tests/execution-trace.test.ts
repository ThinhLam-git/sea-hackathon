import {describe,expect,it} from "vitest";
import {Simulator} from "../lib/order-rescue-v2/simulator";
import {loadCase} from "../lib/order-rescue-v2/fixtures";

describe("observable execution records",()=>{
 it("records seven measured stages while keeping Replay free of service calls",async()=>{
  const sim=new Simulator(),[,d]=await sim.start("DEMO-001");
  expect(d.execution_trace?.map(s=>s.name)).toEqual(d.skills_run);
  expect(d.execution_trace).toHaveLength(7);expect(d.execution_trace?.every(s=>s.status==="completed"&&s.duration_ms>=0&&Number.isFinite(Date.parse(s.started_at)))).toBe(true);
  expect(d.model_info.service_calls).toEqual([]);expect(d.model_info.tools_configured).toBe(0);
  expect(d.execution_trace?.find(s=>s.name==="assess-case")?.kind).toBe("agent");
 });
 it("records skipped AI steps after an eligibility halt without inventing completed work",async()=>{
  const c=loadCase("DEMO-001");c.input.return_state="COMPLETED";
  const sim=new Simulator("LIVE_AI",{apiKey:"never-sent-secret"}),[,d]=await sim.start(c.case_id,c);
  expect(d.execution_trace?.find(s=>s.name==="load-case")?.status).toBe("halted");
  expect(d.execution_trace?.filter(s=>s.status==="skipped").map(s=>s.name)).toEqual(["prepare-input","assess-case","validate-output"]);
  expect(d.skills_run).not.toContain("assess-case");expect(JSON.stringify(d)).not.toContain("never-sent-secret");
 });
 it("records No reply as selection, with no new API operations or mutation of initial trace",async()=>{
  const sim=new Simulator(),[r,initial]=await sim.start("DEMO-001"),before=JSON.stringify(initial);
  const d=sim.noReply(r.run_id,crypto.randomUUID(),r.question_wait_state!.question_id)!;
  expect(d.execution_trace?.map(s=>s.name)).toEqual(["select-initial","audit-log"]);
  expect(d.model_info.service_calls).toEqual([]);expect(d.model_info.origin_assessment_decision_id).toBe(initial.decision_id);
  expect(d.workflow_execution_id).not.toBe(initial.workflow_execution_id);expect(JSON.stringify(initial)).toBe(before);
  expect(r.after_reply_assessment).toBeNull();expect(d.agent).toEqual(initial.agent);
 });
});

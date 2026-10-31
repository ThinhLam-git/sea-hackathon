import { afterEach, describe, expect, it, vi } from "vitest";
import { assessWithHostedAgent, type AgentAudit } from "../lib/order-rescue-v2/hosted-agent";
import { scenarios } from "../lib/order-rescue-v2/evaluator";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const output = scenarios[0].expected.initial_assessment;
function mock(options: {status?:string;sessionStatus?:string;emptyReads?:number;readFailures?:number;
  output?:unknown;phase?:string;turnId?:string;createStatus?:number;cancelFails?:boolean} = {}) {
  let cancelled=false, reads=0, failures=0;
  const fetch=vi.fn(async(url:string,init?:RequestInit) => {
    if(url.endsWith("/sessions")) return Response.json({id:"sess_test",status:"in_progress"}, {status:options.createStatus??200});
    if(url.endsWith("/events")) {
      expect(JSON.parse(String(init?.body))).toEqual({events:[{type:"agent.session.input.cancel"}]});
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("cancel-sess_test");
      if(options.cancelFails)throw new Error("private-provider-detail");
      cancelled=true;return new Response(null,{status:202});
    }
    if(url.includes("/turns?")) {
      if(failures++ < (options.readFailures??0))throw new Error("private-provider-detail");
      return Response.json({has_more:false,data:[{id:"turn_test",session_id:"sess_test",agent_id:"agent_test",status:cancelled?"cancelled":options.status??"completed"}]});
    }
    if(url.includes("/items?")) return Response.json({has_more:false,data:reads++ < (options.emptyReads??0)?[]:[{
      type:"message",role:"assistant",status:"completed",phase:options.phase??"final_answer",turn_id:options.turnId??"turn_test",
      content:[{type:"output_text",text:JSON.stringify(options.output??output)}],
    }]});
    return Response.json({id:"sess_test",status:options.sessionStatus??"idle",required_actions:[]});
  });vi.stubGlobal("fetch",fetch);return fetch;
}
const run=(audit:AgentAudit,timing={timeoutMs:1000,pollMs:1,cleanupMs:100}) =>
  assessWithHostedAgent("test-key","gpt-5.4-mini",{only:"current raw facts"},audit,{run_id:"run_test",stage:"INITIAL"},timing);
describe("managed agent lifecycle",()=>{
  it("reads the completed turn's durable final answer and records provider IDs",async()=>{
    const fetch=mock(),audit:AgentAudit={status:"new"};expect(await run(audit)).toEqual(output);
    expect(audit).toMatchObject({session_id:"sess_test",turn_id:"turn_test",agent_id:"agent_test",status:"completed"});
    expect(fetch.mock.calls.filter(([,o])=>o?.method==="POST")).toHaveLength(1);
  });
  it("recovers missing saved items without creating another turn",async()=>{
    const fetch=mock({emptyReads:1});expect(await run({status:"new"})).toEqual(output);
    expect(fetch.mock.calls.filter(([url])=>url.includes("/items?"))).toHaveLength(2);
    expect(fetch.mock.calls.filter(([,o])=>o?.method==="POST")).toHaveLength(1);
  });
  it("recovers transient observation failures without resubmitting input",async()=>{
    const fetch=mock({readFailures:1});expect(await run({status:"new"})).toEqual(output);
    expect(fetch.mock.calls.filter(([,o])=>o?.method==="POST")).toHaveLength(1);
  });
  it.each(["failed","cancelled"])("rejects terminal %s even if the session is idle",async(status)=>{
    const fetch=mock({status});await expect(run({status:"new"})).rejects.toThrow(`agent_${status}`);
    expect(fetch.mock.calls.some(([url])=>url.includes("/items?"))).toBe(false);
  });
  it.each([{phase:"commentary"},{turnId:"other_turn"},{output:{refusal:"Cannot assess"}},{output:{...output,extra:"unexpected"}}])("rejects commentary, unrelated turns, refusals and invalid schema: %j",async(options)=>{
    mock(options);await expect(run({status:"new"})).rejects.toThrow(/agent_output_missing|invalid_agent_output/);
  });
  it("cancels unexpected required actions instead of executing tools",async()=>{
    mock({status:"waiting",sessionStatus:"requires_action"});const audit:AgentAudit={status:"new"};
    await expect(run(audit)).rejects.toThrow("unexpected_agent_action");expect(audit.cancellation).toBe("confirmed");
  });
  it("does not treat idle as success, and confirms cancellation on deadline",async()=>{
    const fetch=mock({status:"in_progress"}),audit:AgentAudit={status:"new"};
    await expect(run(audit,{timeoutMs:20,pollMs:1,cleanupMs:100})).rejects.toThrow("agent_timeout");
    expect(audit.cancellation).toBe("confirmed");expect(fetch.mock.calls.some(([url])=>url.includes("/items?"))).toBe(false);
  });
  it("retains IDs and unconfirmed cancellation without leaking provider errors",async()=>{
    mock({status:"waiting",sessionStatus:"requires_action",cancelFails:true});const audit:AgentAudit={status:"new"};
    await expect(run(audit)).rejects.toThrow("unexpected_agent_action");
    expect(audit).toMatchObject({session_id:"sess_test",turn_id:"turn_test",cancellation:"unconfirmed"});
    expect(JSON.stringify(audit)).not.toContain("private-provider-detail");
  });
  it("fails closed on missing API permission without creating a replacement session",async()=>{
    const fetch=mock({createStatus:403});await expect(run({status:"new"})).rejects.toThrow("agent_access_denied");expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("never retries an ambiguous session-creation timeout",async()=>{
    const fetch=vi.fn().mockRejectedValue(new Error("private-provider-detail"));vi.stubGlobal("fetch",fetch);
    await expect(run({status:"new"})).rejects.toThrow("agent_unavailable");expect(fetch).toHaveBeenCalledTimes(1);
  });
});

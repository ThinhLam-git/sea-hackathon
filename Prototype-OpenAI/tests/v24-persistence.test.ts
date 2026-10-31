import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Simulator } from "../lib/order-rescue-v2/simulator";
import { persist, restore, reserve, release } from "../lib/order-rescue-v2/repository";

let sqlite:DatabaseSync;
function statement(sql:string,params:any[]=[]):any {
 return {bind:(...values:any[])=>statement(sql,values),first:async()=>sqlite.prepare(sql).get(...params)??null,
  all:async()=>({results:sqlite.prepare(sql).all(...params)}),run:async()=>({meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}})};
}
const db={prepare:statement,batch:async(items:any[])=>{
 sqlite.exec("BEGIN");try{const results=[];for(const item of items)results.push(await item.run());sqlite.exec("COMMIT");return results;}
 catch(error){sqlite.exec("ROLLBACK");throw error;}
}};
vi.mock("../lib/order-rescue/repository",()=>({database:()=>db,runtime:()=>({}),HttpError:class extends Error{constructor(public status:number,message:string){super(message);}}}));
beforeEach(()=>{sqlite=new DatabaseSync(":memory:");sqlite.exec(readFileSync(new URL("../drizzle/0000_clear_warstar.sql",import.meta.url),"utf8"));});
afterEach(()=>sqlite.close());
describe("v2.4 durable finalization and ownership",()=>{
 it("persists no-reply as a new audit decision without changing the initial record",async()=>{
  const sim=new Simulator(),[r]=await sim.start("DEMO-005");await persist(sim,r.run_id,"owner");
  const before=sqlite.prepare("SELECT payload FROM rescue_decisions WHERE run_id=? AND sequence=0").get(r.run_id);
  const loaded=await restore(r.run_id,"owner",true),lease=await reserve(r.run_id,"owner",loaded.revision);
  loaded.sim.noReply(r.run_id,crypto.randomUUID(),r.question_wait_state!.question_id);
  await persist(loaded.sim,r.run_id,"owner",lease.revision);await release(r.run_id,"owner",lease);
  const saved=await restore(r.run_id,"owner"),state=saved.sim.runs.get(r.run_id)!;
  expect(state.initial_policy_output?.final_action).toBe("CLARIFY");expect(state.final_policy_output?.final_action).toBe("ESCALATE_REVIEW");
  expect(state.after_reply_assessment).toBeNull();expect(saved.sim.history(r.run_id)).toHaveLength(2);
  expect(sqlite.prepare("SELECT payload FROM rescue_decisions WHERE run_id=? AND sequence=0").get(r.run_id)).toEqual(before);
 });
 it("isolates owners and prevents concurrent reservations or stale writes",async()=>{
  const sim=new Simulator(),[r]=await sim.start("DEMO-001");await persist(sim,r.run_id,"alice");
  await expect(restore(r.run_id,"bob",true)).rejects.toMatchObject({status:404});
  const lease=await reserve(r.run_id,"alice",0);
  await expect(reserve(r.run_id,"alice",0)).rejects.toMatchObject({status:409});
  await expect(persist(sim,r.run_id,"alice",0)).rejects.toMatchObject({status:409});
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM rescue_decisions").get()).toMatchObject({n:1});
  await release(r.run_id,"alice",lease);await expect(restore(r.run_id,"alice",true)).resolves.toBeDefined();
 });
 it("allows historical v2.2 reads but rejects mutation and preserves rows",async()=>{
  const sim=new Simulator(),[r]=await sim.start("DEMO-001");r.contract_version="2.2";await persist(sim,r.run_id,"owner");
  await expect(restore(r.run_id,"owner")).resolves.toBeDefined();
  await expect(restore(r.run_id,"owner",true)).rejects.toMatchObject({status:409});
  expect(JSON.parse(sqlite.prepare("SELECT state FROM rescue_runs WHERE id=?").get(r.run_id)!.state as string).contract_version).toBe("2.2");
 });
 it("surfaces a failed storage write instead of returning a durable success",async()=>{
  const sim=new Simulator(),[r]=await sim.start("DEMO-001");sqlite.exec("DROP TABLE rescue_decisions");
  await expect(persist(sim,r.run_id,"owner")).rejects.toThrow();
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM rescue_runs").get()).toMatchObject({n:0});
 });
});

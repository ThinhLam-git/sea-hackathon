import { env } from "cloudflare:workers";
import { MODEL } from "../../../../packages/agent/src/skills/assess-case/skill";
import type { RuntimeConfig } from "../../../../packages/agent/src/ports/runtime";
import { Simulator } from "../../../../packages/agent/src/workflow/simulator";
import type { Decision, RunState } from "../../../../packages/agent/src/models";
import { workflowData } from "../application/v2-workflow-data";
import OpenAI from "openai";
import { inspectAgentSession, snapshotHashForRun } from "../../../../packages/agent/src/runtime/recovery";
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function database() { if (!env.DB) throw new HttpError(503, "Demo storage is unavailable"); return env.DB; }
export function runtime(requestSignal?:AbortSignal):RuntimeConfig {
 const timeout=Number(env.ORDER_RESCUE_AGENT_TIMEOUT_MS||process.env.ORDER_RESCUE_AGENT_TIMEOUT_MS),toolCalls=Number(env.ORDER_RESCUE_MAX_TOOL_CALLS||process.env.ORDER_RESCUE_MAX_TOOL_CALLS);
 const agentTimeoutMs=Number.isFinite(timeout)&&timeout>=10000&&timeout<=120000?timeout:110000;
 const deadline=AbortSignal.timeout(agentTimeoutMs),assessmentSignal=requestSignal?AbortSignal.any([requestSignal,deadline]):deadline;
 const apiKey=env.OPENAI_API_KEY||process.env.OPENAI_API_KEY;
 return {openAIClient:apiKey?new OpenAI({apiKey,maxRetries:0,timeout:agentTimeoutMs}):undefined,model:env.ORDER_RESCUE_MODEL||process.env.ORDER_RESCUE_MODEL||MODEL,
  agentRuntime:(env.ORDER_RESCUE_RUNTIME||process.env.ORDER_RESCUE_RUNTIME)==="LEGACY_RESPONSES"?"LEGACY_RESPONSES":"AGENTS_API",
  agentTimeoutMs,assessmentSignal,
  maxAgentToolCalls:Number.isInteger(toolCalls)&&toolCalls>=5&&toolCalls<=12?toolCalls:7,tracing:false};
}
export async function restore(id:string,owner:string,forMutation=false,requestSignal?:AbortSignal){
 const row=await database().prepare("SELECT * FROM rescue_runs WHERE id = ? AND owner = ?").bind(id,owner).first<{mode:"REPLAY"|"LIVE_AI";state:string;revision:number;write_token:string}>();
 if(!row)throw new HttpError(404,"Review session not found.");
 if(forMutation&&row.write_token.startsWith("lock:")&&Number(row.write_token.split(":")[1])>Date.now())throw new HttpError(409,"This case is already being assessed. Wait for the current review to finish.");
 const state=JSON.parse(row.state) as RunState;
 if(state.contract_version!=="2.2")throw new HttpError(409,"This session uses the older demo. Start a new v2.2 review; the old record is preserved.");
 if(forMutation&&["CREATING","ACTIVE","RECOVERY_REQUIRED"].includes(state.agent_session_status??""))throw new HttpError(409,"Agent work is unresolved. Inspect and reconcile this run before submitting another event.");
 const sim=new Simulator(row.mode,runtime(requestSignal),workflowData);sim.runs.set(id,state);
 const rows=await database().prepare("SELECT payload FROM rescue_decisions WHERE run_id = ? ORDER BY sequence").bind(id).all<{payload:string}>();
 sim.decisions.set(id,rows.results.map(r=>JSON.parse(r.payload) as Decision));return {sim,revision:row.revision};
}

export async function inspectAndReconcile(sim:Simulator,id:string,signal?:AbortSignal){
 const run=sim.runs.get(id)!;
 if(run.current_status==="COMPLETED")return {status:"BUSINESS_CASE_ALREADY_FINAL",next_action:"The final business outcome is immutable."};
 if(!run.agent_session_id)return {status:"SESSION_ID_UNKNOWN",next_action:"Session creation may have completed ambiguously. Do not create a replacement session; inspect again if the run later records a session ID."};
 const phase=run.current_status==="NEW"&&!run.initial_assessment?"INITIAL":run.pending_event&&!run.after_reply_assessment?"AFTER_REPLY":null;
 if(!phase)return {status:"NO_INTERRUPTED_ASSESSMENT",next_action:"There is no unfinished assessment to reconcile."};
 const config=runtime(signal),client=config.openAIClient;
 if(!client)return {status:"INSPECTION_FAILED",failure_category:"authentication",next_action:"Configure the server-side OpenAI key, then inspect this same session."};
 const snapshotHash=await snapshotHashForRun(run,phase);
 const inspection=await inspectAgentSession(client.beta.agents.sessions,{session_id:run.agent_session_id,turn_id:run.agent_turn_id,phase,ledger:run.agent_tool_ledger??[],expected_snapshot_hash:snapshotHash,signal});
 if(inspection.status==="REMOTE_IN_PROGRESS")return inspection;
 if(inspection.status==="RESULTS_REDELIVERED"){
  run.agent_session_status="ACTIVE";
  return inspection;
 }
 if(inspection.status==="REMOTE_IDLE"){
  const reconciled=await sim.reconcileStoredAssessment(id,snapshotHash);
  if(reconciled.status==="FINALIZED_FROM_STORED_RESULTS"||reconciled.status==="BUSINESS_CASE_ALREADY_FINAL")return {...inspection,status:reconciled.status,decision_id:reconciled.decision?.decision_id??null};
  run.agent_session_status="RECOVERY_REQUIRED";
  return {...inspection,status:reconciled.status,next_action:"The remote turn is idle, but no complete validated decision chain is available. Keep this case unresolved for Ops review; do not repeat Decisions requests."};
 }
 if(["REMOTE_AWAITING_ACTION","REMOTE_FAILED","UNRESOLVED"].includes(inspection.status))run.agent_session_status="RECOVERY_REQUIRED";
 return inspection;
}
export async function persist(sim:Simulator,id:string,owner:string,revision?:number,expectedWriteToken?:string){
 const db=database(),run=sim.runs.get(id)!,token=crypto.randomUUID();
 const mutation=revision===undefined?db.prepare("INSERT INTO rescue_runs (id,owner,mode,state,revision,write_token,created_at) VALUES (?,?,?,?,0,?,?)").bind(id,owner,sim.mode,JSON.stringify(run),token,new Date().toISOString()):expectedWriteToken
  ?db.prepare("UPDATE rescue_runs SET state = ?, mode = ?, revision = revision + 1, write_token = ? WHERE id = ? AND owner = ? AND revision = ? AND write_token = ?").bind(JSON.stringify(run),sim.mode,token,id,owner,revision,expectedWriteToken)
  :db.prepare("UPDATE rescue_runs SET state = ?, mode = ?, revision = revision + 1, write_token = ? WHERE id = ? AND owner = ? AND revision = ?").bind(JSON.stringify(run),sim.mode,token,id,owner,revision);
 const inserts=sim.history(id).map((d,i)=>db.prepare("INSERT OR IGNORE INTO rescue_decisions (id,run_id,sequence,payload) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM rescue_runs WHERE id = ? AND write_token = ?)").bind(d.decision_id,id,i,JSON.stringify(d),id,token));
 const result=await db.batch([mutation,...inserts]);if(result[0].meta.changes!==1)throw new HttpError(409,"This case changed in another tab. Refresh before continuing.");
}

/** Checkpoint state while preserving the reply lease and its revision. */
export async function checkpoint(sim:Simulator,id:string,owner:string,lease:{revision:number;token:string}){
 const result=await database().prepare("UPDATE rescue_runs SET state = ?, mode = ? WHERE id = ? AND owner = ? AND revision = ? AND write_token = ?")
  .bind(JSON.stringify(sim.runs.get(id)!),sim.mode,id,owner,lease.revision,lease.token).run();
 if(result.meta.changes!==1)throw new HttpError(409,"This case changed while its assessment was running. The result needs explicit recovery.");
}

/** A short reservation serializes reply/no-reply without adding an account or queue system. */
export async function reserve(id:string,owner:string,revision:number){
 const token=`lock:${Date.now()+180000}:${crypto.randomUUID()}`;
 const result=await database().prepare("UPDATE rescue_runs SET write_token = ?, revision = revision + 1 WHERE id = ? AND owner = ? AND revision = ? AND (write_token NOT LIKE 'lock:%' OR CAST(substr(write_token,6,13) AS INTEGER) <= ?)").bind(token,id,owner,revision,Date.now()).run();
 if(result.meta.changes!==1)throw new HttpError(409,"This case is already being reviewed or changed in another tab. Refresh before continuing.");
 return {revision:revision+1,token};
}
export async function release(id:string,owner:string,lease:{revision:number;token:string}){
 await database().prepare("UPDATE rescue_runs SET write_token = ?, revision = revision + 1 WHERE id = ? AND owner = ? AND revision = ? AND write_token = ?").bind(crypto.randomUUID(),id,owner,lease.revision,lease.token).run();
}

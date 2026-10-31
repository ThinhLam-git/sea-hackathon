import { database, runtime, HttpError } from "../order-rescue/repository";
import { Simulator } from "./simulator";
import { CONTRACT_VERSION, type Decision, type RunState } from "./models";
export { runtime, HttpError };
export async function restore(id:string,owner:string,forMutation=false){
 const row=await database().prepare("SELECT * FROM rescue_runs WHERE id = ? AND owner = ?").bind(id,owner).first<{mode:"REPLAY"|"LIVE_AI";state:string;revision:number;write_token:string}>();
 if(!row)throw new HttpError(404,"Review session not found.");
 if(forMutation&&row.write_token.startsWith("lock:")&&Number(row.write_token.split(":")[1])>Date.now())throw new HttpError(409,"This case is already being assessed. Wait for the current review to finish.");
 const state=JSON.parse(row.state) as RunState;
 if(!["2.2",CONTRACT_VERSION].includes(state.contract_version))throw new HttpError(409,"This session uses an older demo. Start a new review; the old record is preserved.");
 if(forMutation&&state.contract_version!==CONTRACT_VERSION)throw new HttpError(409,"This historical v2.2 review is read-only. Start a new v2.4 review to use the reconciled policy.");
 const sim=new Simulator(row.mode,runtime());sim.runs.set(id,state);
 const rows=await database().prepare("SELECT payload FROM rescue_decisions WHERE run_id = ? ORDER BY sequence").bind(id).all<{payload:string}>();
 sim.decisions.set(id,rows.results.map(r=>JSON.parse(r.payload) as Decision));return {sim,revision:row.revision};
}
export async function persist(sim:Simulator,id:string,owner:string,revision?:number){
 const db=database(),run=sim.runs.get(id)!,token=crypto.randomUUID();
 const mutation=revision===undefined?db.prepare("INSERT INTO rescue_runs (id,owner,mode,state,revision,write_token,created_at) VALUES (?,?,?,?,0,?,?)").bind(id,owner,sim.mode,JSON.stringify(run),token,new Date().toISOString()):db.prepare("UPDATE rescue_runs SET state = ?, mode = ?, revision = revision + 1, write_token = ? WHERE id = ? AND owner = ? AND revision = ?").bind(JSON.stringify(run),sim.mode,token,id,owner,revision);
 const inserts=sim.history(id).map((d,i)=>db.prepare("INSERT OR IGNORE INTO rescue_decisions (id,run_id,sequence,payload) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM rescue_runs WHERE id = ? AND write_token = ?)").bind(d.decision_id,id,i,JSON.stringify(d),id,token));
 const result=await db.batch([mutation,...inserts]);if(result[0].meta.changes!==1)throw new HttpError(409,"This case changed in another tab. Refresh before continuing.");
}

/** A short reservation serializes reply/no-reply without adding an account or queue system. */
export async function reserve(id:string,owner:string,revision:number){
 const token=`lock:${Date.now()+90000}:${crypto.randomUUID()}`;
 const result=await database().prepare("UPDATE rescue_runs SET write_token = ?, revision = revision + 1 WHERE id = ? AND owner = ? AND revision = ? AND (write_token NOT LIKE 'lock:%' OR CAST(substr(write_token,6,13) AS INTEGER) <= ?)").bind(token,id,owner,revision,Date.now()).run();
 if(result.meta.changes!==1)throw new HttpError(409,"This case is already being reviewed or changed in another tab. Refresh before continuing.");
 return {revision:revision+1,token};
}
export async function release(id:string,owner:string,lease:{revision:number;token:string}){
 await database().prepare("UPDATE rescue_runs SET write_token = ?, revision = revision + 1 WHERE id = ? AND owner = ? AND revision = ? AND write_token = ?").bind(crypto.randomUUID(),id,owner,lease.revision,lease.token).run();
}

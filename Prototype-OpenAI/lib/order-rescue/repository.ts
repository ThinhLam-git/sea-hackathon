import { env } from "cloudflare:workers";
import type { Decision, RunState } from "./models";
import { Simulator } from "./simulator";
import { MODEL } from "./skills/assess-case/skill";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function database() { if (!env.DB) throw new HttpError(503, "Demo storage is unavailable"); return env.DB; }
export function runtime() {
  return { apiKey: env.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    model: env.ORDER_RESCUE_MODEL || process.env.ORDER_RESCUE_MODEL || MODEL,
    // Tracing is opt-in; the audit timeline remains available in both modes.
    tracing: false };
}
export async function restore(id: string, owner: string) {
  const row = await database().prepare("SELECT * FROM rescue_runs WHERE id = ? AND owner = ?").bind(id, owner).first<{ id: string; mode: "REPLAY" | "LIVE_AI"; state: string; revision: number }>();
  if (!row) throw new HttpError(404, "Run not found");
  const sim = new Simulator(row.mode, {}, runtime());
  sim.runs.set(id, JSON.parse(row.state) as RunState);
  const rows = await database().prepare("SELECT payload FROM rescue_decisions WHERE run_id = ? ORDER BY sequence").bind(id).all<{payload: string}>();
  sim.decisions.set(id, rows.results.map(x => JSON.parse(x.payload) as Decision));
  return { sim, revision: row.revision };
}
export async function persist(sim: Simulator, id: string, owner: string, revision?: number) {
  const db = database(), run = sim.runs.get(id)!, history = sim.history(id), token = crypto.randomUUID();
  const mutation = revision === undefined
    ? db.prepare("INSERT INTO rescue_runs (id,owner,mode,state,revision,write_token,created_at) VALUES (?,?,?,?,0,?,?)").bind(id,owner,sim.mode,JSON.stringify(run),token,new Date().toISOString())
    : db.prepare("UPDATE rescue_runs SET state = ?, mode = ?, revision = revision + 1, write_token = ? WHERE id = ? AND owner = ? AND revision = ?").bind(JSON.stringify(run),sim.mode,token,id,owner,revision);
  const inserts = history.map((d,i) => db.prepare("INSERT OR IGNORE INTO rescue_decisions (id,run_id,sequence,payload) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM rescue_runs WHERE id = ? AND write_token = ?)")
    .bind(d.decision_id,id,i,JSON.stringify(d),id,token));
  const results = await db.batch([mutation,...inserts]);
  if (results[0].meta.changes !== 1) throw new HttpError(409, "This run changed in another tab. Refresh and try again.");
}

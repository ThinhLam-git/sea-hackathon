import { z } from "zod";
import { Simulator } from "@/lib/order-rescue-v2/simulator";
import { caseIds } from "@/lib/order-rescue-v2/fixtures";
import { runtime, persist, HttpError } from "@/lib/order-rescue-v2/repository";
import { runView } from "@/lib/order-rescue-v2/view";
import { handle, owner } from "@/lib/http";
const bodySchema = z.object({ case_id: z.string(), mode: z.enum(["REPLAY","LIVE_AI"]).default("REPLAY") });
export const POST = (request: Request) => handle(async () => {
  const user = await owner(), body = bodySchema.parse(await request.json());
  if (!caseIds.includes(body.case_id)) throw new HttpError(404,"Unknown case");
  if (body.mode === "LIVE_AI" && !runtime().apiKey) throw new HttpError(503,"Live GPT is not configured yet. Replay is available.");
  let revision=0;
  const sim = new Simulator(body.mode,runtime()), run=sim.createRun(body.case_id);
  await persist(sim,run.run_id,user);
  sim.bindAgentCheckpoints({
    onSessionCreated:async()=>{await persist(sim,run.run_id,user,revision);revision++;},
    onTurnStarted:async()=>{await persist(sim,run.run_id,user,revision);revision++;},
    onToolResult:async()=>{await persist(sim,run.run_id,user,revision);revision++;},
  });
  await sim.assessInitial(run.run_id);
  await persist(sim,run.run_id,user,revision);
  return runView(sim,run.run_id);
});

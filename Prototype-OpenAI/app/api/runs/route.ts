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
  const sim = new Simulator(body.mode,runtime());
  const [run] = await sim.start(body.case_id);
  await persist(sim,run.run_id,user);
  return runView(sim,run.run_id);
});

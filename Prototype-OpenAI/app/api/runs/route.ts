import { z } from "zod";
import { Simulator } from "@/lib/order-rescue-v2/simulator";
import { caseIds } from "@/lib/order-rescue-v2/fixtures";
import { runtime, persist, HttpError } from "@/lib/order-rescue-v2/repository";
import { runView } from "@/lib/order-rescue-v2/view";
import { handle, owner } from "@/lib/http";
import { progressStream } from "@/lib/order-rescue-v2/progress-stream";
const bodySchema = z.object({ case_id: z.string(), mode: z.enum(["REPLAY","LIVE_AI"]).default("REPLAY") });
async function create(request:Request,onProgress?:(name:string,status:"started"|"completed"|"skipped")=>void){
  const user=await owner(),body=bodySchema.parse(await request.json());
  if(!caseIds.includes(body.case_id))throw new HttpError(404,"Unknown case");
  if(body.mode==="LIVE_AI"&&!runtime().apiKey)throw new HttpError(503,"Live GPT is not configured yet. Replay is available.");
  const sim=new Simulator(body.mode,runtime());
  const [run]=await sim.start(body.case_id,undefined,onProgress);
  await persist(sim,run.run_id,user);
  return runView(sim,run.run_id);
}
export const POST=(request:Request)=>new URL(request.url).searchParams.has("progress")
 ?progressStream(emit=>create(request,emit))
 :handle(()=>create(request));

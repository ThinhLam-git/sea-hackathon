import { z } from "zod";
import { restore, persist, reserve, release, runtime, HttpError } from "@/lib/order-rescue-v2/repository";
import { TransitionError } from "@/lib/order-rescue-v2/simulator";
import { runView } from "@/lib/order-rescue-v2/view";
import { handle, owner } from "@/lib/http";
import { progressStream } from "@/lib/order-rescue-v2/progress-stream";
const schema=z.object({text:z.string().trim().min(1).max(2000),event_id:z.string().uuid(),question_id:z.string().min(1),use_live:z.boolean().default(false)});
async function reply(request:Request,context:{params:Promise<{id:string}>},onProgress?:(name:string,status:"started"|"completed"|"skipped")=>void){
 const user=await owner(),{id}=await context.params,body=schema.parse(await request.json()),{sim,revision}=await restore(id,user,true);
 if((body.use_live||sim.mode==="LIVE_AI")&&!runtime().apiKey)throw new HttpError(503,"Live GPT is unavailable. Start a Replay review to use the sample response.");
 const lease=await reserve(id,user,revision);
 try{if(await sim.recordBuyerReply(id,body.text,body.event_id,body.question_id,body.use_live,onProgress))await persist(sim,id,user,lease.revision);}
 catch(e){if(e instanceof TransitionError)throw new HttpError(409,e.code==="live_required"?"Custom text requires Live GPT. Use the sample response for Replay.":e.code==="question_mismatch"?"This response does not match the pending question. Refresh the case.":"This question already has an outcome, or the submission conflicts with it. Review the latest record.");throw e;}finally{await release(id,user,lease);}
 return runView(sim,id);
}
export const POST=(request:Request,context:{params:Promise<{id:string}>})=>new URL(request.url).searchParams.has("progress")
 ?progressStream(emit=>reply(request,context,emit))
 :handle(()=>reply(request,context));

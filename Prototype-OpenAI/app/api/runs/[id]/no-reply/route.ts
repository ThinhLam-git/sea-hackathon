import { z } from "zod";
import { restore, persist, reserve, release, HttpError } from "@/lib/order-rescue-v2/repository";
import { TransitionError } from "@/lib/order-rescue-v2/simulator";
import { runView } from "@/lib/order-rescue-v2/view";
import { handle, owner } from "@/lib/http";
export const POST=(request:Request,context:{params:Promise<{id:string}>})=>handle(async()=>{
 const user=await owner(),{id}=await context.params;
 const body=z.object({event_id:z.string().uuid(),question_id:z.string().min(1)}).parse(await request.json()),{sim,revision}=await restore(id,user,true);
 const lease=await reserve(id,user,revision);
 try{if(sim.noReply(id,body.event_id,body.question_id))await persist(sim,id,user,lease.revision,lease.token);}
 catch(e){if(e instanceof TransitionError)throw new HttpError(409,"This question already has an outcome or does not match the pending question. Refresh and review the case.");throw e;}finally{await release(id,user,lease);}
 return runView(sim,id);
});

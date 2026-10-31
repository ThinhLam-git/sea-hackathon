import { z } from "zod";
import { restore, persist, HttpError } from "@/lib/order-rescue/repository";
import { runView } from "@/lib/order-rescue/view";
import { handle, owner } from "@/lib/http";
export const POST = (request: Request, context: {params: Promise<{id:string}>}) => handle(async () => {
  const user=await owner(), {id}=await context.params;
  const {source_ref}=z.object({source_ref:z.string()}).parse(await request.json());
  const {sim,revision}=await restore(id,user), run=sim.runs.get(id)!;
  const event=run.case.sources.find(s=>s.source_ref===source_ref && s.phase==="RUNTIME");
  if (!event || !sim.canApply(run,event)) throw new HttpError(400,"This event is not available yet.");
  if (event.source_type === "BUYER_REPLY" && run.replied_after_question && !run.applied.some(s=>s.source_ref===source_ref)) throw new HttpError(409,"A buyer response has already been recorded.");
  if (await sim.applyEvent(id,source_ref)) await persist(sim,id,user,revision);
  return runView(sim,id);
});

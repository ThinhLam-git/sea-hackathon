import { z } from "zod";
import { restore, persist } from "@/lib/order-rescue/repository";
import { runView } from "@/lib/order-rescue/view";
import { handle, owner } from "@/lib/http";
export const POST = (request: Request, context: {params: Promise<{id:string}>}) => handle(async () => {
  const user=await owner(), {id}=await context.params;
  const {minutes}=z.object({minutes:z.number().int().positive().max(10080)}).parse(await request.json());
  const {sim,revision}=await restore(id,user); await sim.advance(id,minutes); await persist(sim,id,user,revision); return runView(sim,id);
});

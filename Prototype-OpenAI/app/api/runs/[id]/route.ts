import { restore } from "@/lib/order-rescue-v2/repository";
import { runView } from "@/lib/order-rescue-v2/view";
import { handle, owner } from "@/lib/http";
export const GET = (_: Request, context: {params: Promise<{id:string}>}) => handle(async () => {
  const user=await owner(), {id}=await context.params, {sim}=await restore(id,user); return runView(sim,id);
});

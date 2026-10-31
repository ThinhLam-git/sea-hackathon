import { getRun } from "@web/lib/application/runs-service";
import { handle, owner } from "@web/lib/http";
export const GET = (_: Request, context: {params: Promise<{id:string}>}) => handle(async () => {
  const user=await owner(), {id}=await context.params; return getRun(id,user);
});

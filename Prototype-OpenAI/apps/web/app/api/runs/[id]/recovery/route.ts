import { recoverRun } from "@web/lib/application/runs-service";
import { handle, owner } from "@web/lib/http";

export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const user = await owner(), { id } = await context.params;
  return recoverRun(user, id, request.signal);
});

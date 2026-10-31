import { z } from "zod";
import { selectNoReply } from "@web/lib/application/runs-service";
import { handle, owner } from "@web/lib/http";

const schema = z.object({ event_id: z.string().uuid(), question_id: z.string().min(1) });
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const user = await owner(), { id } = await context.params, body = schema.parse(await request.json());
  return selectNoReply(user, id, body, request.signal);
});

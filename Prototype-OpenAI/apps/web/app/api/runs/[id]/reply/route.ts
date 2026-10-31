import { z } from "zod";
import { replyToRun } from "@web/lib/application/runs-service";
import { handle, owner } from "@web/lib/http";

const schema = z.object({ text: z.string().trim().min(1).max(2000).optional(), use_sample: z.boolean().default(false),
  event_id: z.string().uuid(), question_id: z.string().min(1), use_live: z.boolean().default(false) })
  .refine((body) => body.use_sample ? body.text === undefined : !!body.text, "Provide either text or a saved sample response");
export const POST = (request: Request, context: { params: Promise<{ id: string }> }) => handle(async () => {
  const user = await owner(), { id } = await context.params, body = schema.parse(await request.json());
  return replyToRun(user, id, body, request.signal);
});

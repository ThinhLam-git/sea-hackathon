import { z } from "zod";
import { createRun } from "@web/lib/application/runs-service";
import { handle, owner } from "@web/lib/http";

const bodySchema = z.object({ case_id: z.string(), mode: z.enum(["REPLAY", "LIVE_AI"]).default("REPLAY") });
export const POST = (request: Request) => handle(async () => {
  const user = await owner(), body = bodySchema.parse(await request.json());
  return createRun(user, body, request.signal);
});

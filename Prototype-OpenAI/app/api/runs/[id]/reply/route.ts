import { z } from "zod";
import { restore, persist, runtime, HttpError } from "@/lib/order-rescue/repository";
import { BuyerReplyError } from "@/lib/order-rescue/simulator";
import { runView } from "@/lib/order-rescue/view";
import { handle, owner } from "@/lib/http";

const bodySchema = z.object({ text: z.string().trim().min(1).max(2000), event_id: z.string().uuid(), use_live: z.boolean().default(false) });
const messages: Record<BuyerReplyError["code"], string> = {
  invalid_reply: "Enter a buyer response of 1–2000 characters.",
  not_asked: "A buyer question must be approved before recording a response.",
  already_recorded: "A buyer response has already been recorded. Review the latest decision.",
  timed_out: "The reply window has closed. Operations must review this case.",
  live_required: "A custom response needs a live GPT assessment. Use the sample response for Replay.",
  event_conflict: "This response was already submitted with different text. Refresh and review the record.",
};
export const POST = (request: Request, context: {params: Promise<{id:string}>}) => handle(async () => {
  const user = await owner(), {id} = await context.params;
  const body = bodySchema.parse(await request.json()), {sim,revision} = await restore(id,user);
  if ((body.use_live || sim.mode === "LIVE_AI") && !runtime().apiKey) throw new HttpError(503,"Live GPT is unavailable. Use the sample response in a Replay run.");
  try {
    if (await sim.recordBuyerReply(id,body.text,body.event_id,body.use_live)) await persist(sim,id,user,revision);
  } catch (error) {
    if (error instanceof BuyerReplyError) throw new HttpError(error.code === "invalid_reply" ? 400 : 409,messages[error.code]);
    throw error;
  }
  return runView(sim,id);
});

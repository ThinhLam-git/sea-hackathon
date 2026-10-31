import { getChatGPTUser } from "@web/app/chatgpt-auth";
import { HttpError } from "./infrastructure/order-rescue-repository";
export async function owner() {
  const user = await getChatGPTUser();
  if (user) return user.userId;
  if (import.meta.env.DEV) return "local-presenter";
  throw new HttpError(401, "Please sign in with ChatGPT to use this demo.");
}
export async function handle(fn: () => Promise<unknown>) {
  try { return Response.json(await fn(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof HttpError) return Response.json({detail:error.message},{status:error.status});
    if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) return Response.json({detail:"Invalid request"},{status:400});
    console.error("Order Rescue request failed", error instanceof Error ? error.name : "unknown");
    return Response.json({detail:"The request could not be completed. Please try again."},{status:500});
  }
}

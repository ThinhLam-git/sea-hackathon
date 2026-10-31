import { runtime } from "@/lib/order-rescue/repository";
import { handle, owner } from "@/lib/http";
export const GET = () => handle(async () => { await owner(); const config=runtime(); return { live_available: !!config.apiKey, model: config.model, agent: "OpenAI Agents SDK", api: "Responses API" }; });

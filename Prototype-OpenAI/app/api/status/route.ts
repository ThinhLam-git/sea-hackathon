import { CONFIDENCE_MODEL } from "@/lib/order-rescue/confidence";
import { runtime } from "@/lib/order-rescue-v2/repository";
import { handle, owner } from "@/lib/http";
export const GET = () => handle(async () => { await owner(); const config=runtime(); return { live_available: !!config.apiKey, model: config.model, agent: "OpenAI hosted agent", api: "Agents API", confidence_api: "Decisions API", confidence_model: CONFIDENCE_MODEL, contract_version:"2.2", case_count:30, no_reply:"MANUAL_USER_NO_REPLY" }; });

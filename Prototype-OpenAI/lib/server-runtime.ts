import { env } from "cloudflare:workers";
export interface RuntimeConfig { apiKey?: string; model?: string; tracing?: boolean }
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function database() { if (!env.DB) throw new HttpError(503, "Demo storage is unavailable"); return env.DB; }
export function runtime(): RuntimeConfig {
  return { apiKey: env.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    model: env.ORDER_RESCUE_MODEL || process.env.ORDER_RESCUE_MODEL || "gpt-5.4-mini", tracing: false };
}

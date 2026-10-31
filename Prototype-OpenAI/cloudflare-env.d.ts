declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    OPENAI_API_KEY?: string;
    ORDER_RESCUE_MODEL?: string;
    ORDER_RESCUE_RUNTIME?: string;
    ORDER_RESCUE_AGENT_TIMEOUT_MS?: string;
    ORDER_RESCUE_MAX_TOOL_CALLS?: string;
    BUCKET?: R2Bucket;
  }
}

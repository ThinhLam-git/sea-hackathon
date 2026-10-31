declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    OPENAI_API_KEY?: string;
    ORDER_RESCUE_MODEL?: string;
    BUCKET?: R2Bucket;
  }
}

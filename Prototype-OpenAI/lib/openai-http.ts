/** Server-only HTTP transport. No client SDK, response bodies or secrets in errors. */
export class OpenAIHttpError extends Error {
  constructor(public status: number) { super("openai_request_failed"); }
}
export async function openaiRequest<T>(apiKey: string, path: string, options: {
  body?: unknown; timeoutMs?: number; signal?: AbortSignal; idempotencyKey?: string;
} = {}): Promise<T> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 10000)])
    : AbortSignal.timeout(options.timeoutMs ?? 10000);
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    method: options.body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
      ...(path.startsWith("/agents/") ? { "OpenAI-Beta": "agents=v1" } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body), signal,
  });
  if (!response.ok) { await response.body?.cancel(); throw new OpenAIHttpError(response.status); }
  if (response.status === 202 || response.status === 204) { await response.body?.cancel(); return undefined as T; }
  return await response.json() as T;
}

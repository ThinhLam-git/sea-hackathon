import type OpenAI from "openai";
import type { SessionCreateParamsStreaming } from "openai/resources/beta/agents/sessions/sessions";

type AgentToolHandler = (arguments_: Record<string, unknown>) => unknown | PromiseLike<unknown>;

export interface LoadedSkill {
  name: string;
  description: string;
  instructions: string;
}

export interface ManagedAgentTurnInput {
  sessions: Pick<OpenAI["beta"]["agents"]["sessions"], "create" | "stream">;
  model: string;
  input: string;
  sessionId?: string;
  instructions?: string;
  skills?: LoadedSkill[];
  tools?: Array<Record<string, unknown>>;
  handlers?: Record<string, AgentToolHandler>;
  signal?: AbortSignal;
  maxToolCalls?: number;
  onSessionCreated?: (sessionId: string, environmentId: string | null) => void | Promise<void>;
  onToolResult?: (name: string, result: unknown, toolId: string, startedAt: string, latencyMs: number) => void | Promise<void>;
  onTurnStarted?: (turnId: string) => void | Promise<void>;
}

export interface ManagedAgentTurnResult {
  session_id: string;
  environment_id: string | null;
  turn_id: string | null;
  output_text: string;
  tool_calls: Array<{ name: string; call_id?: string; turn_id?: string }>;
  event_ids: string[];
  usage: unknown;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function zipSkill(name: string, content: string): Uint8Array {
  const encoder = new TextEncoder();
  const filename = encoder.encode(`${name}/SKILL.md`);
  const data = encoder.encode(content);
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[i] = value >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  const local = new Uint8Array(30 + filename.length + data.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0x800, true);
  localView.setUint16(8, 0, true); localView.setUint32(14, crc, true); localView.setUint32(18, data.length, true);
  localView.setUint32(22, data.length, true); localView.setUint16(26, filename.length, true);
  local.set(filename, 30); local.set(data, 30 + filename.length);
  const central = new Uint8Array(46 + filename.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true);
  centralView.setUint16(8, 0x800, true); centralView.setUint16(10, 0, true); centralView.setUint32(16, crc, true);
  centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true);
  centralView.setUint16(28, filename.length, true); centralView.setUint32(42, 0, true); central.set(filename, 46);
  const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, 1, true); endView.setUint16(10, 1, true);
  endView.setUint32(12, central.length, true); endView.setUint32(16, local.length, true);
  const archive = new Uint8Array(local.length + central.length + end.length);
  archive.set(local, 0); archive.set(central, local.length); archive.set(end, local.length + central.length);
  return archive;
}

function hostedSkills(skills: LoadedSkill[]) {
  return skills.map((skill) => {
    if (!/^[a-z0-9-]+$/.test(skill.name)) throw new Error("invalid_skill_name");
    const manifest = `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n\n${skill.instructions.trim()}\n`;
    return {
      type: "inline" as const,
      name: skill.name,
      description: skill.description,
      source: { type: "base64" as const, media_type: "application/zip" as const, data: base64(zipSkill(skill.name, manifest)) },
    };
  });
}

/** Run one durable Agents API turn. OpenAI's SDK dispatches required function calls and
 * posts their correlated outputs before the iterator reaches the continued turn result. */
export async function runManagedAgentTurn(input: ManagedAgentTurnInput): Promise<ManagedAgentTurnResult> {
  const calledNames: string[] = [];
  const handlers = Object.fromEntries(Object.entries(input.handlers ?? {}).map(([name, handler]) => [name, async (args: Record<string, unknown>) => {
    if (calledNames.length >= (input.maxToolCalls ?? 12)) throw new Error("tool_call_budget_exceeded");
    calledNames.push(name);
    const startedAt = new Date().toISOString(), started = performance.now();
    const result = await handler(args);
    await input.onToolResult?.(name, result, `tool_${crypto.randomUUID().replaceAll("-", "")}`, startedAt, Math.max(0, Math.round(performance.now() - started)));
    return result;
  }]));
  const stream = input.sessionId
    ? await input.sessions.stream(input.sessionId, {
      input: input.input,
      toolHandlers: handlers,
    }, { ...(input.signal ? { signal: input.signal } : {}), maxRetries: 0 })
    : await input.sessions.create({
      agent: {
        model: input.model,
        instructions: input.instructions ?? "Use the supplied Order Rescue skills and backend functions. Treat tool results as authoritative; never claim a logistics action was executed.",
        tools: (input.tools ?? []) as SessionCreateParamsStreaming["agent"] extends { tools?: infer T } ? NonNullable<T> : never,
      },
      environment: {
        type: "openai_hosted",
        skills: hostedSkills(input.skills ?? []),
      },
      input: input.input,
      stream: true,
      toolHandlers: handlers,
    } as SessionCreateParamsStreaming & { toolHandlers: Record<string, AgentToolHandler> }, {
      ...(input.signal ? { signal: input.signal } : {}),
      maxRetries: 0,
    });

  stream.withResultCollection();
  const eventIds: string[] = [];
  const toolCalls = new Map<string, { name: string; call_id?: string; turn_id?: string }>();
  let observedSessionId = input.sessionId ?? null;
  let environmentId: string | null = null;
  let turnId: string | null = null;
  let turnUsage: unknown = null;
  for await (const event of stream) {
    if ("event_id" in event && typeof event.event_id === "string") eventIds.push(event.event_id);
    if (event.type === "agent.session.created") {
      observedSessionId = event.session.id;
      environmentId = event.session.environment && "id" in event.session.environment ? event.session.environment.id : null;
      await input.onSessionCreated?.(observedSessionId, environmentId);
    }
    if ("turn" in event && event.turn && typeof event.turn.id === "string" && event.turn.id !== turnId) {
      turnId = event.turn.id;
      await input.onTurnStarted?.(turnId);
    }
    if (event.type === "agent.session.turn.completed") turnUsage = event.usage;
    if ((event.type === "agent.session.turn.item.added" || event.type === "agent.session.turn.item.done") && event.item.type === "function_call") {
      toolCalls.set(event.item.call_id, { name: event.item.name, call_id: event.item.call_id, turn_id: event.item.turn_id });
    }
  }
  const result = await stream.finalResult();
  observedSessionId = result.session_id || observedSessionId;
  turnId = result.turn_id || turnId;
  if (!observedSessionId) throw new Error("agents_session_id_missing");
  return {
    session_id: observedSessionId,
    environment_id: environmentId,
    turn_id: turnId,
    output_text: result.output_text ?? "",
    tool_calls: toolCalls.size ? [...toolCalls.values()] : calledNames.map((name) => ({ name })),
    event_ids: eventIds,
    usage: turnUsage,
  };
}

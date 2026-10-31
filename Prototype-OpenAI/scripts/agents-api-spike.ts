import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import { runManagedAgentTurn } from "../lib/order-rescue-v2/agents/session";
import { HYPOTHESES } from "../lib/order-rescue-v2/models";

const apiKey = process.env.OPENAI_API_KEY;
if (process.argv[2] !== "--run-live") throw new Error("Pass --run-live to run the bounded synthetic API probe.");
if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

const model = process.env.ORDER_RESCUE_MODEL || "gpt-6-sol";
const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 90_000 });
const syntheticSnapshot = {
  case_id: "SYNTHETIC-AGENTS-SPIKE",
  failed_event: { status: "BUYER_UNREACHABLE", occurred_at: "2026-10-31T09:00:00+07:00" },
  attempts_used: 1,
  return_state: "NOT_STARTED",
  deadline: "2026-11-01T00:00:00+07:00",
  buyer_history: [],
  operational_context: { disruption: null },
};
const syntheticSources = [{
  source_ref: "SYNTHETIC-COURIER-NOTE",
  source_type: "COURIER_NOTE",
  verification: "UNVERIFIED_REPORT",
  occurred_at: "2026-10-31T09:00:00+07:00",
  content: { text: "Synthetic note: courier reports buyer was not reached." },
}];
const decisionsTool = {
  type: "function",
  name: "evaluate_hypothesis",
  description: "Evaluate the current synthetic evidence with the Decisions API and return the complete cause distribution.",
  parameters: {
    type: "object",
    properties: { snapshot_ref: { type: "string" } },
    required: ["snapshot_ref"],
    additionalProperties: false,
  },
};
const snapshotTool = {
  type: "function",
  name: "get_case_snapshot",
  description: "Load the current synthetic probe snapshot and its source registry.",
  parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
};
let decisionRequests = 0;
let decisionEvidence: unknown;
const handlers = {
  get_case_snapshot: async () => ({ snapshot_ref: "spike-synthetic-v1", snapshot: syntheticSnapshot, sources: syntheticSources }),
  evaluate_hypothesis: async (args: Record<string, unknown>) => {
    if (args.snapshot_ref !== "spike-synthetic-v1") throw new Error("unknown_snapshot");
    if (decisionRequests >= 1) throw new Error("spike_decision_budget_exceeded");
    decisionRequests += 1;
    const response = await client.decisions.create({
      model: "gpt-6-luna",
      input: [{ role: "user", content: [
        { type: "input_text", text: "Select the most supported failed-delivery cause from the current synthetic snapshot. Preserve the full distribution." },
        { type: "input_json", data: { snapshot: syntheticSnapshot, sources: syntheticSources } },
      ] }],
      questions: [{
        type: "choice",
        name: "hypothesis",
        instructions: "Which BI v2.2 cause best explains the supplied failed event? Use UNKNOWN_CAUSE when the sources do not support a specific cause.",
        choices: HYPOTHESES.map((value) => ({ value, description: value.replaceAll("_", " ").toLowerCase() })),
      }],
    }, { maxRetries: 0, timeout: 20_000, signal: AbortSignal.timeout(25_000) });
    const answer = response.answers[0];
    decisionEvidence = { decision_id: crypto.randomUUID(), request_id: response._request_id ?? null, answer };
    return decisionEvidence;
  },
};
const skillText = await readFile(new URL("../lib/order-rescue-v2/agents/skills/investigate-case/SKILL.md", import.meta.url), "utf8");
const [, frontmatter, instructions] = skillText.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
if (!frontmatter || !instructions) throw new Error("investigate_case_skill_manifest_invalid");

const result = await runManagedAgentTurn({
  sessions: client.beta.agents.sessions,
  model,
  input: "Use the investigate-case skill. Load the snapshot, evaluate the hypothesis once, then continue and summarize the recorded Decisions result. This is synthetic data; do not request or perform an operational action.",
  instructions: "You are validating a synthetic integration probe. Use the investigate-case skill. Call get_case_snapshot first, then evaluate_hypothesis with its snapshot_ref. After the tool returns, continue the same turn with a concise summary of the selected cause and complete distribution. Do not call any tool more than once.",
  skills: [{ name: "investigate-case", description: "Load current case facts and preserve source provenance.", instructions: instructions.trim() }],
  tools: [snapshotTool, decisionsTool],
  handlers,
  maxToolCalls: 2,
  signal: AbortSignal.timeout(120_000),
});
let environmentSkills: unknown = null;
if (result.environment_id) {
  const environment = await client.beta.agents.environments.retrieve(result.environment_id);
  environmentSkills = environment.skills;
}
const toolNames = result.tool_calls.map((call) => call.name);
const skillLoaded = Array.isArray(environmentSkills) && environmentSkills.some((skill: any) => skill?.name === "investigate-case");
const report = {
  evidence: "LIVE_OPENAI_API",
  model,
  decisions_model: "gpt-6-luna",
  session_id: result.session_id,
  environment_id: result.environment_id,
  turn_id: result.turn_id,
  tool_calls: result.tool_calls,
  tool_names: toolNames,
  skill_loading: environmentSkills,
  skill_loaded: skillLoaded,
  decisions_requests: decisionRequests,
  decisions_result: decisionEvidence,
  agent_usage: result.usage,
  agent_output: result.output_text,
  success: skillLoaded && toolNames.includes("get_case_snapshot") && toolNames.includes("evaluate_hypothesis") && decisionRequests === 1 && Boolean(result.output_text.trim()),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.success) process.exitCode = 1;

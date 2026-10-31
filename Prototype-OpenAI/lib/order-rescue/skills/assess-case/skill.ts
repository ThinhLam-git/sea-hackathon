import { Agent, Runner, OpenAIProvider } from "@openai/agents";
import OpenAI from "openai";
import { Assessment, stop, type PipelineState } from "../../models";
import { PROMPT } from "./prompt";
import type { RuntimeConfig } from "../../pipeline";

export const RUNS_WHEN_HALTED = false;
export const PROMPT_VERSION = "assess-v0.5";
export const MODEL = "gpt-5.4-mini";

export function createAssessmentAgent(model = MODEL) {
  return new Agent({ name: "order-rescue-assessor", instructions: PROMPT, model,
    outputType: Assessment, tools: [], handoffs: [], modelSettings: { store: false } });
}

export async function run(state: PipelineState, config: RuntimeConfig = {}): Promise<PipelineState> {
  state.model_info = { mode: state.mode, prompt_version: PROMPT_VERSION, replay_key: state.replay_key,
    runtime: "OpenAI Agents SDK", api: "Responses API" };
  try {
    if (state.mode === "REPLAY") {
      const entry = state.replay_store[state.replay_key];
      if (!entry) throw new Error("replay_missing");
      if (entry.prompt_version !== PROMPT_VERSION || entry.policy_version !== state.policy.policy_version) throw new Error("replay_version_mismatch");
      Object.assign(state.model_info, { model: entry.model, replay_source: entry.source });
      const parsed = Assessment.safeParse(entry.output);
      if (!parsed.success) throw new Error("invalid_model_output");
      state.assessment = parsed.data;
    } else {
      const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("model_unavailable");
      const model = config.model ?? process.env.ORDER_RESCUE_MODEL ?? MODEL;
      const client = new OpenAI({ apiKey, maxRetries: 0, timeout: 30000 });
      const provider = new OpenAIProvider({ openAIClient: client, useResponses: true });
      const runner = new Runner({ modelProvider: provider, tracingDisabled: !config.tracing,
        traceIncludeSensitiveData: false, workflowName: "Order Rescue · seven-step assessment" });
      const result = await runner.run(createAssessmentAgent(model), JSON.stringify(state.snapshot),
        { maxTurns: 1, signal: AbortSignal.timeout(35000) });
      if (!result.finalOutput) throw new Error("model_refused_or_empty");
      const parsed = Assessment.safeParse(result.finalOutput);
      if (!parsed.success) throw new Error("invalid_model_output");
      state.assessment = parsed.data;
      state.model_info.model = model;
      state.model_info.replay_source = "live_model";
    }
  } catch (error) {
    const known = ["replay_missing", "replay_version_mismatch", "invalid_model_output", "model_refused_or_empty"];
    const message = error instanceof Error ? error.message : "";
    stop(state, `AI:${known.includes(message) ? message : "model_unavailable"}`);
    // Only safe error metadata is retained; provider errors may include credentials or request content.
    if (error instanceof OpenAI.APIError) state.model_info.api_error = { status: error.status, code: error.code };
  }
  return state;
}

import { withTrace, withCustomSpan } from "@openai/agents";
import type { PipelineState, Skill } from "./models";
import * as loadCase from "./skills/load-case/skill";
import * as prepareInput from "./skills/prepare-input/skill";
import * as assessCase from "./skills/assess-case/skill";
import * as validateOutput from "./skills/validate-output/skill";
import * as policyGate from "./skills/policy-gate/skill";
import * as composeRecommendation from "./skills/compose-recommendation/skill";
import * as auditLog from "./skills/audit-log/skill";

export interface RuntimeConfig { apiKey?: string; model?: string; tracing?: boolean }
export const PIPELINE: [string, Skill, string][] = [
  ["load-case", loadCase, "Gate 1 · eligibility"],
  ["prepare-input", prepareInput, "Current facts only"],
  ["assess-case", assessCase, "GPT · evidence and proposal"],
  ["validate-output", validateOutput, "Check citations and confidence"],
  ["policy-gate", policyGate, "Gate 2 · policy rules"],
  ["compose-recommendation", composeRecommendation, "Approved recommendation"],
  ["audit-log", auditLog, "Append decision history"],
];

export async function runPipeline(state: PipelineState, config: RuntimeConfig = {}) {
  const executionId = `local_${crypto.randomUUID().replaceAll("-", "")}`;
  async function execute() {
    for (const [name, skill] of PIPELINE) {
      if (state.halted && !skill.RUNS_WHEN_HALTED) continue;
      const step = async () => {
        state = name === "assess-case" ? await assessCase.run(state, config) : await skill.run(state);
        state.trace.push(name);
      };
      if (config.tracing && state.mode === "LIVE_AI") await withCustomSpan(step, { data: { name } });
      else await step();
    }
    return state;
  }
  if (config.tracing && state.mode === "LIVE_AI") {
    return withTrace("Order Rescue · assessment", async trace => ({ state: await execute(), executionId: trace.traceId }),
      { groupId: state.run.run_id, metadata: { case_id: state.run.case.case_id, policy_version: state.policy.policy_version } });
  }
  return { state: await execute(), executionId };
}

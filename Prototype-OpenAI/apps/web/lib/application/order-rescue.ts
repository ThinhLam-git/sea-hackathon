import { Simulator } from "../../../../packages/agent/src/workflow/simulator";
import type { RuntimeConfig } from "../../../../packages/agent/src/ports/runtime";
import type { WorkflowDataPort } from "../../../../packages/agent/src/ports/runtime";
import { runtime } from "../infrastructure/order-rescue-repository";
import { workflowData } from "./v2-workflow-data";

export function createSimulator(mode: "REPLAY" | "LIVE_AI" = "REPLAY", config?: RuntimeConfig, data: WorkflowDataPort = workflowData) {
  return new Simulator(mode, config ?? runtime(), data);
}

\n
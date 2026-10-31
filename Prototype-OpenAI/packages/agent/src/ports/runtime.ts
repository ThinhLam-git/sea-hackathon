import type OpenAI from "openai";
import type { AgentToolLedgerEntry } from "../models";
import type { Assessment } from "../../../contracts/src/index";

export interface RuntimeConfig {
  /** A preconfigured server-side client. The application resolves and protects its key. */
  openAIClient?: OpenAI;
  model?: string;
  tracing?: boolean;
  agentTimeoutMs?: number;
  assessmentSignal?: AbortSignal;
  maxAgentToolCalls?: number;
  agentRuntime?: "AGENTS_API" | "LEGACY_RESPONSES";
  agentSessions?: OpenAI["beta"]["agents"]["sessions"];
  replayAssessment?: (caseId: string, phase: "INITIAL" | "AFTER_REPLY") => { assessment: unknown; source: string } | undefined;
  onAgentSessionCreated?: (runId: string, sessionId: string, environmentId: string | null) => void | Promise<void>;
  onAgentTurnStarted?: (runId: string, turnId: string) => void | Promise<void>;
  onAgentToolResult?: (runId: string, entry: AgentToolLedgerEntry) => void | Promise<void>;
  onAgentRemoteCancel?: (runId: string, status: "NOT_REQUESTED" | "ACCEPTED" | "AMBIGUOUS" | "UNAVAILABLE") => void | Promise<void>;
}

export interface WorkflowDataPort {
  listCases(): Array<{ case_id: string; title: string; group: string }>;
  loadCase(caseId: string): import("../../../contracts/src/index").RawCase;
  replayAssessment?(caseId: string, phase: "INITIAL" | "AFTER_REPLY"): { assessment: Assessment; source: string } | undefined;
  replaySemanticFacts?(caseId: string): unknown;
  replaySampleReply?(caseId: string): string | undefined;
}

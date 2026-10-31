import { z } from "zod";
import type { Assessment, ConfidenceScore } from "../../../contracts/src/index";

export const CONFIDENCE_MODEL = "gpt-6-luna";
export const CONFIDENCE_RUBRIC_VERSION = "evidence-support-v2.2";
export const CONFIDENCE_QUESTION = {
  type: "score" as const,
  name: "evidence_support",
  instructions: "Rate the strength of evidence supporting the proposed failed-delivery hypothesis. This measures evidence support, not delivery-success probability or permission to act. Interpret semantic evidence only from the supplied snapshot. Missing or conflicting cause evidence lowers the score. T0 buyer statements and verified operational signals may support high cause confidence even when current retry readiness is unresolved.",
  levels: [
    { label: "LOW", description: "Unknown cause, material contradictions, or little usable support." },
    { label: "MEDIUM", description: "Plausible cause with partial, indirect, or unverified support." },
    { label: "HIGH", description: "Cause directly supported by current or T0 buyer evidence or a verified matching operational signal." },
  ],
};

const ScoreAnswer = z.object({
  type: z.literal("score"), name: z.literal("evidence_support"), score: z.number().finite().min(0).max(2),
  confidence: z.number().finite().min(0).max(1),
  probabilities: z.array(z.object({ value: z.number().int().min(0).max(2), label: z.string(), probability: z.number().finite().min(0).max(1) })).length(3),
});
export class ConfidenceError extends Error {
  constructor(public code: "confidence_unavailable" | "confidence_refused" | "invalid_confidence_output") { super(code); }
}
export function parseConfidence(response: unknown): ConfidenceScore {
  const answers = (response as { answers?: unknown[] })?.answers;
  if (!Array.isArray(answers) || answers.length !== 1) throw new ConfidenceError("invalid_confidence_output");
  const answer = answers[0] as { type?: string; name?: string };
  if (answer?.type === "refusal" && answer.name === CONFIDENCE_QUESTION.name) throw new ConfidenceError("confidence_refused");
  const parsed = ScoreAnswer.safeParse(answer);
  if (!parsed.success) throw new ConfidenceError("invalid_confidence_output");
  const data = parsed.data, values = new Set(data.probabilities.map((item) => item.value));
  const mass = data.probabilities.reduce((sum, item) => sum + item.probability, 0);
  const weighted = data.probabilities.reduce((sum, item) => sum + item.value * item.probability, 0);
  if (values.size !== 3 || data.probabilities.some((item) => item.label !== ["LOW", "MEDIUM", "HIGH"][item.value]) || Math.abs(mass - 1) > 0.02 || Math.abs(weighted - data.score) > 0.02) throw new ConfidenceError("invalid_confidence_output");
  const score = Math.round(data.score * 50);
  return { source: "openai_decisions", model: CONFIDENCE_MODEL, rubric_version: CONFIDENCE_RUBRIC_VERSION,
    score, raw_score: score, rubric_score: data.score, level: score < 25 ? "LOW" : score < 75 ? "MEDIUM" : "HIGH",
    scorer_confidence: data.confidence, probabilities: data.probabilities, capped: false };
}

\n
import { minLevel, sourceText, stop, type PipelineState } from "../../models.js";

import { applyConfidenceCap } from "../../confidence";

export const RUNS_WHEN_HALTED = false;

const normalize = (t: unknown) => String(t).normalize("NFC").toLowerCase().split(/\s+/).filter(Boolean).join(" ");

function rejection(state: PipelineState): string | null {
  const a = state.assessment!, index = state.source_index;
  for (const item of a.evidence) {
    if (!index[item.source_ref]) return "invalid_evidence_reference";
    if (!normalize(sourceText(index[item.source_ref])).includes(normalize(item.quote))) return "unsupported_claim";
  }
  if (a.candidate_action === "CLARIFY" && !a.question_key) return "missing_question_key";
  const texts = [a.explanation, ...a.evidence.map((e) => e.fact)].map(normalize);
  if (state.policy.prohibited_patterns.some((p: string) => texts.some((t) => new RegExp(p).test(t)))) return "prohibited_wording";
  return null;
}

export function run(state: PipelineState): PipelineState {
  const reason = rejection(state);
  if (reason) {
    state.validation_issues.push(reason);
    if (state.confidence_score) {
      state.model_info.confidence_scoring = { status: "invalidated", reason, raw_result: state.confidence_score };
      state.confidence_score = undefined;
    }
    stop(state, `AI:${reason}`);
    return state;
  }
  const a = state.assessment!, index = state.source_index, issues = state.validation_issues;
  const types = new Set(a.evidence.map((e) => index[e.source_ref].source_type));

  for (const item of a.evidence) {
    if (item.verified && index[item.source_ref].source_type === "COURIER_NOTE") {
      item.verified = false;
      issues.push(`courier_note_unverified:${item.source_ref}`);
    }
  }
  if (!types.has("BUYER_REPLY") && (a.buyer_intent !== "UNKNOWN" || a.availability !== "UNKNOWN" || a.location_clarified)) {
    Object.assign(a, { buyer_intent: "UNKNOWN", availability: "UNKNOWN", location_clarified: false });
    issues.push("buyer_finding_without_buyer_reply");
  }

  const verifiedDisruption = a.evidence.some((e) => e.verified && index[e.source_ref].source_type === "DISRUPTION_SIGNAL");
  let cap: typeof a.confidence = (types.has("BUYER_REPLY") || verifiedDisruption) && a.evidence.length >= 2 ? "HIGH" : "MEDIUM";
  if (a.evidence.length === 0) cap = "LOW";
  if (a.sources_conflict) cap = minLevel(cap, "MEDIUM");
  if (minLevel(a.confidence, cap) !== a.confidence) {
    issues.push(`confidence_capped:${a.confidence}->${cap}`);
    a.confidence = cap;
  }
  applyConfidenceCap(state);
  return state;
}

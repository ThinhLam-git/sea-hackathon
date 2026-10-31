import seed from "../../../../fixtures/v2/seed.json";
import controls from "../../../../fixtures/v2/controls.json";
import replay from "../../../../fixtures/v2/replay.json";
import replaySemantics from "../../../../fixtures/v2/replay-semantics.json";
import type { Assessment, RawCase, Source } from "../../../../packages/contracts/src/index";
import type { WorkflowDataPort } from "../../../../packages/agent/src/ports/runtime";

const rows = seed.seed_data;
const controlFor = (caseId: string) => controls.find((item) => item.case_id === caseId);

export const profile = seed.demo_policy_profile;
export const caseIds = rows.order_rescue.map((row) => row.case_id);

export function loadCase(id: string): RawCase {
  const rescue = rows.order_rescue.find((row) => row.case_id === id);
  if (!rescue) throw new Error("Unknown v2 case");
  const order = rows.fact_order.find((row) => row.order_id === rescue.order_id)!;
  const event = rows.fact_delivery_event.find((row) => row.event_id === rescue.failed_event_id)!;
  if (event.order_id !== order.order_id) throw new Error("Seed relationship mismatch");
  const context = structuredClone(order.operational_context) as Record<string, any>;
  const t0 = rows.fact_rescue_interaction.filter((interaction) => interaction.case_id === id && interaction.available_phase === "T0");
  if (t0.length) context.buyer_messages_t0 = t0.map((interaction) => ({ source_ref: interaction.interaction_id, text: interaction.message_text, occurred_at: interaction.occurred_at }));
  const sources: Source[] = [
    { source_ref: event.event_id, phase: "T0", source_type: "FAILED_DELIVERY", actor: event.source_actor, occurred_at: event.event_time, content: structuredClone(event.raw_payload) },
    { source_ref: `${id}-NOTE`, phase: "T0", source_type: "COURIER_NOTE", actor: "courier", occurred_at: event.event_time, content: { text: event.courier_note } },
    ...t0.map((interaction) => ({ source_ref: interaction.interaction_id, phase: "T0" as const, source_type: "BUYER_MESSAGE", actor: interaction.source_actor, occurred_at: interaction.occurred_at, content: { text: interaction.message_text } })),
  ];
  for (const [ref, index] of Object.entries(seed.source_ref_index)) if (ref.startsWith(`${id}-`) && index.source_type === "OPS_CONTEXT") {
    const keys = (index as { keys?: string[] }).keys ?? [];
    sources.push({ source_ref: ref, phase: "T0", source_type: "OPS_CONTEXT", actor: index.source_actor, occurred_at: rescue.as_of, content: Object.fromEntries(keys.map((key) => [key, context[key]])) });
  }
  return { case_id: id, input: { case_id: id, failed_event: { status: event.event_status, time: event.event_time, courier_note: event.courier_note, reported_reason: event.reported_reason, as_of: rescue.as_of }, attempts_used: rescue.attempts_used, return_state: rescue.return_state as any, deadline: rescue.deadline_at, buyer_history: [], operational_context: context }, sources };
}

export const workflowData: WorkflowDataPort = {
  listCases: () => caseIds.map((case_id) => {
    const raw = loadCase(case_id);
    return { case_id, title: String(raw.input.failed_event.status).replaceAll("_", " ").toLowerCase(), group: controlFor(case_id)?.group ?? "Other" };
  }),
  loadCase,
  replayAssessment: (caseId, phase) => {
    const entry = (replay.cases as Record<string, any>)[caseId]?.[phase];
    return entry ? { assessment: structuredClone(entry) as Assessment, source: replay.source } : undefined;
  },
  replaySemanticFacts: (caseId) => (replaySemantics as Record<string, unknown>)[caseId],
  replaySampleReply: (caseId) => controlFor(caseId)?.buyer_reply ?? undefined,
};

\n
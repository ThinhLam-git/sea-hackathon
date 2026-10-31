import { compare } from "./golden";
import { PIPELINE } from "./pipeline";
import { sourceText } from "./models";
import type { Simulator } from "./simulator";
export function runView(sim: Simulator, id: string) {
  const run = sim.runs.get(id)!, history = sim.history(id);
  const applied = new Set(run.applied.map(s => s.source_ref));
  return { run_id: id, case_id: run.case.case_id, group: run.case.group, title: run.case.title,
    mode: sim.mode, now: run.now, input: run.input,
    question: { asked: run.questions_asked, key: run.question_key, deadline: run.question_deadline,
      replied: run.replied_after_question, timed_out: run.timeout_fired },
    sources: [...run.case.sources.filter(s => s.phase === "T0"), ...run.applied],
    events: run.case.sources.filter(s => s.phase === "RUNTIME").map(s => ({ source_ref: s.source_ref,
      type: s.source_type, text: sourceText(s), occurred_at: s.occurred_at,
      applied: applied.has(s.source_ref), available: sim.canApply(run,s) })),
    pipeline: PIPELINE.map(([name,,purpose]) => ({name,purpose})), history,
    golden: compare(run.case, history.at(-1)!), expected: run.case.expected };
}
export type RunView = ReturnType<typeof runView>;

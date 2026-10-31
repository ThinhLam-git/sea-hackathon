/**
 * Presenter-side simulator: loads the 25 sheet cases, applies RUNTIME sources, moves the virtual clock.
 * It supplies raw data and events. The workflow decides what to recommend.
 */
import { ms, sourceText, type CaseFile, type Decision, type PipelineState, type RunState, type Source } from "./models";
import { runPipeline, type RuntimeConfig } from "./pipeline";
import { cases, policy, replays } from "./fixtures";
const addMinutes = (iso: string, m: number) => new Date(ms(iso) + m * 60_000).toISOString();
export const loadCase = (caseId: string): CaseFile => {
  if (!cases[caseId]) throw new Error("Unknown case");
  return structuredClone(cases[caseId]);
};

/** Sheet rule 3: a solicited reply (or its timeout) only exists after the question was allowed. */
export function needsQuestion(s: Source): boolean {
  if (s.source_type === "NO_REPLY_OBSERVED" || s.source_type === "QUESTION_TIMEOUT") return true;
  return s.source_type === "BUYER_REPLY" && s.content?.question_id !== "UNSOLICITED";
}

export class BuyerReplyError extends Error {
  constructor(public code: "invalid_reply" | "not_asked" | "already_recorded" | "timed_out" | "live_required" | "event_conflict") { super(code); }
}

export class Simulator {
  policy = structuredClone(policy);
  runs = new Map<string, RunState>();
  decisions = new Map<string, Decision[]>();

  constructor(public mode: "REPLAY" | "LIVE_AI" = "REPLAY", private replayOverrides: Record<string, any> = {}, private runtime: RuntimeConfig = {}) {}

  listCases() {
    return Object.values(cases).sort((a,b) => a.case_id.localeCompare(b.case_id)).map(c => ({
      case_id: c.case_id, group: c.group, title: c.title, status: c.input.failed_event.status,
    }));
  }

  /** Select (or reset) a case: new run, clock at failed_event.as_of, first assessment. */
  async start(caseId: string, override?: CaseFile): Promise<[RunState, Decision]> {
    const c = override ?? loadCase(caseId);
    const run: RunState = {
      run_id: `${c.case_id}-${crypto.randomUUID().slice(0, 8)}`, case: c, input: structuredClone(c.input),
      now: new Date(c.input.failed_event.as_of ?? c.input.failed_event.time).toISOString(), applied: [],
      questions_asked: 0, question_key: null, question_deadline: null, replied_after_question: false, timeout_fired: false,
    };
    this.runs.set(run.run_id, run);
    this.decisions.set(run.run_id, []);
    return [run, await this.assess(run, "START")];
  }

  canApply(run: RunState, s: Source) { return !needsQuestion(s) || run.questions_asked > 0; }

  /** Apply a RUNTIME source from sheet 04. Duplicates are ignored (R20). */
  async applyEvent(runId: string, ref: string): Promise<Decision | null> {
    const run = this.runs.get(runId)!;
    const s = run.case.sources.find((x) => x.source_ref === ref && x.phase === "RUNTIME");
    if (!s) throw new Error(`${ref} is not a runtime event of ${run.case.case_id}`);
    if (!this.canApply(run, s)) throw new Error(`${ref} is a reply to a question that has not been asked yet`);
    return this.apply(run, s);
  }

  /** Staff records what the buyer said; arbitrary text requires an explicit live assessment. */
  async recordBuyerReply(runId: string, text: string, eventId: string, useLive = false): Promise<Decision | null> {
    const run = this.runs.get(runId)!, reply = text.trim();
    if (!reply || reply.length > 2000 || !/^[0-9a-f-]{36}$/i.test(eventId)) throw new BuyerReplyError("invalid_reply");
    const ref = `${run.case.case_id}-REPLY-${eventId}`;
    const prior = run.applied.find(s => s.source_ref === ref);
    if (prior) {
      if (sourceText(prior) !== reply) throw new BuyerReplyError("event_conflict");
      return null;
    }
    const prepared = run.case.sources.find(s => s.phase === "RUNTIME" && s.source_type === "BUYER_REPLY" && needsQuestion(s) && sourceText(s).trim() === reply);
    if (prepared && run.applied.some(s => s.source_ref === prepared.source_ref)) return null;
    if (!run.questions_asked) throw new BuyerReplyError("not_asked");
    if (run.replied_after_question) throw new BuyerReplyError("already_recorded");
    if (run.timeout_fired || (run.question_deadline && ms(run.now) >= ms(run.question_deadline))) throw new BuyerReplyError("timed_out");
    if (this.mode === "REPLAY" && !prepared && !useLive) throw new BuyerReplyError("live_required");
    if (useLive) this.mode = "LIVE_AI";
    if (prepared) return this.applyEvent(runId, prepared.source_ref);
    return this.apply(run, {
      source_ref: ref, phase: "RUNTIME", source_type: "BUYER_REPLY", actor: "buyer_recorded_by_staff",
      occurred_at: run.now, content: { text: reply, question_id: `${run.case.case_id}-Q1` },
    });
  }

  /** Move the virtual clock. Fires QUESTION_TIMEOUT when the reply window passes. */
  async advance(runId: string, minutes: number): Promise<Decision[]> {
    const run = this.runs.get(runId)!;
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 10080) throw new Error("Minutes must be between 1 and 10080");
    run.now = addMinutes(run.now, minutes);
    if (run.questions_asked && !run.replied_after_question && !run.timeout_fired
        && run.question_deadline && ms(run.now) >= ms(run.question_deadline)) {
      const timeout = run.case.sources.find((s) => s.source_type === "QUESTION_TIMEOUT") ?? {
        source_ref: `${run.case.case_id}-TIMEOUT`, phase: "RUNTIME", source_type: "QUESTION_TIMEOUT",
        actor: "virtual_clock", occurred_at: run.question_deadline, content: { question_id: `${run.case.case_id}-Q1` },
      } satisfies Source;
      const d = await this.apply(run, timeout);
      return d ? [d] : [];
    }
    return [];
  }

  history(runId: string) { return this.decisions.get(runId)!; }

  private async apply(run: RunState, s: Source): Promise<Decision | null> {
    if (run.applied.some((x) => x.source_ref === s.source_ref)) return null;
    if (ms(s.occurred_at) > ms(run.now)) run.now = new Date(s.occurred_at).toISOString();
    if (s.source_type === "BUYER_REPLY" && run.questions_asked) run.replied_after_question = true;
    if (s.source_type === "QUESTION_TIMEOUT") run.timeout_fired = true;
    run.applied.push(s);
    return this.assess(run, s.source_ref);
  }

  private async assess(run: RunState, trigger: string): Promise<Decision> {
    const caseId = run.case.case_id;
    const replay = caseId in this.replayOverrides ? this.replayOverrides[caseId] : replays[caseId] ?? {};
    // The golden answer never enters the workflow (so it is neither in traces nor near the model).
    const { expected, ...caseWithoutGolden } = run.case;
    const state: PipelineState = {
      run: { ...structuredClone(run), case: { ...structuredClone(caseWithoutGolden), expected: undefined } }, policy: this.policy, mode: this.mode, trigger,
      replay_key: ["START", ...run.applied.map((s) => s.source_ref).sort()].join("+"),
      replay_store: replay, snapshot: null, source_index: {}, assessment: null, model_info: {},
      validation_issues: [], result: null, decision: null, halted: false, trace: [],
    };
    const { state: final, executionId } = await runPipeline(state, this.runtime);
    const decision = { ...final.decision!, skills_run: final.trace, workflow_execution_id: executionId };
    if (decision.final_action === "CLARIFY") {
      run.questions_asked += 1;
      run.question_key = decision.agent!.question_key;
      run.question_deadline = addMinutes(run.now, this.policy.response_window_minutes);
      run.replied_after_question = false;
    }
    this.decisions.get(run.run_id)!.push(decision);
    return decision;
  }
}

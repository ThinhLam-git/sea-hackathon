/** Compare a decision with the golden expected output of the v0.5 sheet (tests, CLI and UI only). */
import type { CaseFile, Decision } from "./models.js";

export function compare(c: CaseFile, d: Decision) {
  const exp = c.expected;
  const rows: [string, unknown, unknown][] = [["record_status", exp.record_status, d.record_status]];
  if (exp.policy) for (const f of ["eligibility", "policy_gate", "final_action"] as const) rows.push([f, exp.policy[f], d[f]]);
  if (exp.agent) for (const f of ["hypothesis", "confidence", "question_key", "candidate_action"] as const) {
    rows.push([f, exp.agent[f], d.agent ? d.agent[f] : null]);
  }
  return rows.map(([field, expected, actual]) => ({ field, expected, actual, ok: expected === actual }));
}

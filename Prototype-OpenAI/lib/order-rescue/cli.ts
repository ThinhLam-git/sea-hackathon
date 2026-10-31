/**
 * Terminal demo: plays each case's runtime events (sheet 04) and compares the final record with the golden sheet.
 *   npm run demo              # all 25 cases (REPLAY)
 *   npm run demo -- OR-001    # one case, every decision
 */
import { compare } from "./golden.js";
import { Simulator, loadCase } from "./simulator.js";
import type { Decision } from "./models.js";

export async function play(sim: Simulator, caseId: string) {
  const c = loadCase(caseId);
  let [run, decision] = await sim.start(caseId);
  for (const ref of c.expected.script) {
    const s = c.sources.find((x) => x.source_ref === ref)!;
    if (sim.canApply(run, s)) decision = (await sim.applyEvent(run.run_id, ref)) ?? decision;
  }
  return { c, run, decision };
}

function printDecision(d: Decision) {
  console.log(`  [${d.decided_at}] ${d.record_status.padEnd(9)} ${(d.policy_gate ?? "—").padEnd(10)} → ${d.final_action ?? "—"}   (trigger: ${d.trigger})`);
  console.log(`      ${d.headline}`);
  if (d.agent) console.log(`      Agent: ${d.agent.hypothesis} · ${d.agent.confidence} · ${d.agent.candidate_action}`);
  if (d.question_text) console.log(`      Câu hỏi: "${d.question_text}"`);
  console.log(`      Lý do [${d.rules.join(", ")}]: ${d.reason}`);
}

async function main() {
  const caseId = process.argv[2];
  const sim = new Simulator(process.env.ORDER_RESCUE_MODE === "LIVE_AI" ? "LIVE_AI" : "REPLAY");
  if (caseId) {
    const { c, run } = await play(sim, caseId);
    console.log(`=== ${c.case_id} · ${c.group} · ${c.title}`);
    sim.history(run.run_id).forEach(printDecision);
    const rows = compare(c, sim.history(run.run_id).at(-1)!);
    console.log("  Golden:", rows.every((r) => r.ok) ? "✓ khớp" : rows.filter((r) => !r.ok));
    return;
  }
  let matched = 0;
  const cases = sim.listCases();
  for (const item of cases) {
    const { c, decision: d } = await play(sim, item.case_id);
    const rows = compare(c, d);
    const ok = rows.every((r) => r.ok);
    matched += Number(ok);
    console.log(`${ok ? "✓" : "✗"} ${c.case_id}  ${d.record_status.padEnd(9)} ${(d.eligibility ?? "—").padEnd(10)} ${(d.policy_gate ?? "—").padEnd(10)} ${(d.final_action ?? "—").padEnd(19)} ${d.rules.join(",").padEnd(12)} ${c.title.slice(0, 50)}`);
    if (!ok) console.log("    ", rows.filter((r) => !r.ok));
  }
  console.log(`\n${matched}/${cases.length} case khớp golden (sheet v0.5) · chế độ ${sim.mode}`);
}

if (process.argv[1]?.endsWith("cli.ts")) main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });

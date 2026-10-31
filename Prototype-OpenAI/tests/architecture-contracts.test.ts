import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { ORDER_RESCUE_SKILLS } from "../packages/agent/src/skills/hosted";
import { Simulator } from "../packages/agent/src/workflow/simulator";
import { workflowData } from "../apps/web/lib/application/v2-workflow-data";
import { runView } from "../apps/web/lib/application/v2-view";

const root = process.cwd();
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

describe("source package and browser DTO boundaries", () => {
  it("keeps contracts free of agent, provider, Worker binding, and secret configuration imports", () => {
    const source = readFileSync(resolve(root, "packages/contracts/src/index.ts"), "utf8");
    expect(source.match(/^import /gm) ?? []).toHaveLength(1);
    expect(source).toContain('from "zod"');
    expect(source).not.toMatch(/from ["'](?:openai|@openai\/agents)|cloudflare:workers|apiKey|OPENAI_API_KEY|AgentRuntime|expected_assessment/i);
  });

  it("keeps agent source independent of framework routes, UI, Cloudflare bindings, and environment secrets", () => {
    const source = sourceFiles(resolve(root, "packages/agent/src")).map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).not.toMatch(/apps\/web|cloudflare:workers|@web\/|components\/|localStorage|process\.env|OPENAI_API_KEY/);
    expect(source).toContain("../../contracts/src/index");
  });

  it("keeps browser components on public contracts and does not return evaluator labels or unreleased replies", async () => {
    const browser = sourceFiles(resolve(root, "apps/web/app")).concat(sourceFiles(resolve(root, "apps/web/components")), sourceFiles(resolve(root, "apps/web/hooks")))
      .map((path) => readFileSync(path, "utf8")).join("\n");
    expect(browser).not.toMatch(/@agent\/|packages\/agent\/src|OPENAI_API_KEY|apiKey/);
    const sim = new Simulator("REPLAY", {}, workflowData), [run] = await sim.start("DEMO-001");
    const dto = runView(sim, run.run_id), futureReply = workflowData.replaySampleReply!(run.case.case_id);
    expect(dto).toMatchObject({ expected: null, golden: [], sample_reply_available: true, events: [] });
    expect(JSON.stringify(dto)).not.toContain(futureReply);
    expect(dto).not.toHaveProperty("tool_ledger");
  });

  it("loads all hosted skill files from their new package paths", () => {
    expect(ORDER_RESCUE_SKILLS.map((skill) => skill.name)).toEqual([
      "investigate-case", "assess-decisions", "clarify-buyer", "recommend-recovery",
    ]);
    expect(ORDER_RESCUE_SKILLS.every((skill) => skill.description.length > 10 && skill.instructions.length > 100)).toBe(true);
    const skillDirectory = resolve(root, "packages/agent/src/skills/hosted");
    expect(readdirSync(skillDirectory).filter((name) => name.endsWith("-case") || name.includes("-decisions") || name.includes("-buyer") || name.includes("-recovery"))).toHaveLength(4);
  });
});

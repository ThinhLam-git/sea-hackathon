import investigate from "./skills/investigate-case/SKILL.md?raw";
import assess from "./skills/assess-decisions/SKILL.md?raw";
import clarify from "./skills/clarify-buyer/SKILL.md?raw";
import recommend from "./skills/recommend-recovery/SKILL.md?raw";
import type { LoadedSkill } from "./session";

function parseSkill(raw: string): LoadedSkill {
  const match = raw.match(/^---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n\n([\s\S]*)$/);
  if (!match) throw new Error("invalid_skill_manifest");
  return { name: match[1], description: match[2], instructions: match[3].trim() };
}

export const ORDER_RESCUE_SKILLS = [investigate, assess, clarify, recommend].map(parseSkill);

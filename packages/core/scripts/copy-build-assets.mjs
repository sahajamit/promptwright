// Cross-platform replacement for the bash copy step in the core "build" script.
// tsc only emits .js/.d.ts, so we hand-copy the markdown assets the runtime loads:
//   - src/personas/<name>/SKILL.md -> dist/personas/<name>/SKILL.md (only where tsc emitted that dir)
//   - src/agents/built-in/*.agent.md -> dist/agents/built-in/
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (...p) => path.join(pkgRoot, "src", ...p);
const dist = (...p) => path.join(pkgRoot, "dist", ...p);

// 1. persona SKILL.md files — mirror the original `[ -d "$d" ]` guard (only if tsc made the dist dir)
const personasSrc = src("personas");
if (existsSync(personasSrc)) {
  for (const name of readdirSync(personasSrc)) {
    const skill = path.join(personasSrc, name, "SKILL.md");
    const outDir = dist("personas", name);
    if (existsSync(skill) && existsSync(outDir)) {
      copyFileSync(skill, path.join(outDir, "SKILL.md"));
    }
  }
}

// 2. built-in agent markdown
const agentsSrc = src("agents", "built-in");
const agentsDist = dist("agents", "built-in");
mkdirSync(agentsDist, { recursive: true });
if (existsSync(agentsSrc)) {
  for (const f of readdirSync(agentsSrc)) {
    if (f.endsWith(".agent.md")) {
      copyFileSync(path.join(agentsSrc, f), path.join(agentsDist, f));
    }
  }
}

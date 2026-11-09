import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PER_BETA = 3;
export const PER_RELEASE = 10;

const MODIFICATION = /^(fix|feat|perf)(\([^)]*\))?!?:/;

export function countModifications(subjects) {
  return subjects.filter((s) => MODIFICATION.test(s.trim())).length;
}

export function nextStable(stable) {
  const [a, b, c] = stable.split(".").map(Number);
  return `${a}.${b}.${c + 1}`;
}

export function nextBeta(stable, tags) {
  const target = nextStable(stable);
  const prefix = `${target}-beta.`;
  const used = tags
    .filter((t) => t.startsWith(prefix))
    .map((t) => Number(t.slice(prefix.length)))
    .filter((n) => Number.isInteger(n));
  return `${prefix}${used.length ? Math.max(...used) + 1 : 1}`;
}

export function verdict(sinceStable, sinceTag) {
  if (sinceStable >= PER_RELEASE) return "release";
  if (sinceTag >= PER_BETA) return "beta";
  return "none";
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function subjectsSince(tag) {
  const out = git("log", `${tag}..HEAD`, "--format=%s");
  return out ? out.split("\n") : [];
}

function main() {
  const stable = JSON.parse(readFileSync("manifest.json", "utf8")).version;
  const latestTag = git("describe", "--tags", "--abbrev=0");
  const tags = git("tag", "--list").split("\n");
  const sinceStable = countModifications(subjectsSince(stable));
  const sinceTag = countModifications(subjectsSince(latestTag));
  const r = {
    stable,
    latestTag,
    sinceStable,
    sinceTag,
    nextBeta: nextBeta(stable, tags),
    nextStable: nextStable(stable),
    now: verdict(sinceStable, sinceTag),
  };
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  const s = (n) => (n === 1 ? "modification" : "modifications");
  console.log(`Since ${stable} (stable): ${sinceStable} ${s(sinceStable)} — release at ${PER_RELEASE}.`);
  if (latestTag !== stable) {
    console.log(`Since ${latestTag} (beta): ${sinceTag} ${s(sinceTag)} — beta at ${PER_BETA}.`);
  }
  if (r.now === "release") {
    console.log(`→ Time for RELEASE ${r.nextStable}: bump all 3 version files, run full lint, tag before main.`);
  } else if (r.now === "beta") {
    console.log(`→ Time for BETA ${r.nextBeta}: git tag ${r.nextBeta} && git push origin ${r.nextBeta}`);
  } else {
    console.log(`→ Not yet: ${PER_BETA - sinceTag} more until beta ${r.nextBeta}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

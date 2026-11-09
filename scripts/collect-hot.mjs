import { writeFileSync } from "node:fs";

const OUT = "src/providers/hotData.generated.ts";

const HF_FAMILIES = [
  { pattern: "(llama|meta-)", org: "meta-llama" },
  { pattern: "qwen", org: "Qwen" },
  { pattern: "deepseek", org: "deepseek-ai" },
  { pattern: "(mistral|mixtral|codestral|pixtral|ministral)", org: "mistralai" },
  { pattern: "gemma", org: "google" },
  { pattern: "flux", org: "black-forest-labs" },
  { pattern: "(stable-?diffusion|sdxl)", org: "stabilityai" },
];

const CLOSED = [
  { pattern: "claude-(fable|opus|sonnet)", score: 0.96 },
  { pattern: "(^|/)gpt-5", score: 0.95 },
  { pattern: "gemini-(3|2\\.5-(pro|flash))", score: 0.9 },
  { pattern: "(^|/)gpt-4o", score: 0.9 },
  { pattern: "(^|/)o[34](\\b|-)", score: 0.8 },
  { pattern: "claude-haiku", score: 0.72 },
  { pattern: "(^|/)o1(\\b|-)", score: 0.65 },
  { pattern: "(dall-e|gpt-image|nano-?banana|imagen)", score: 0.6 },
  { pattern: "gemini-(1\\.5|2\\.0)", score: 0.5 },
  { pattern: "claude-3", score: 0.5 },
];

const round2 = (n) => Math.round(n * 100) / 100;

async function hfDownloads(org) {
  const url = `https://huggingface.co/api/models?author=${org}&sort=downloads&limit=20`;
  const res = await fetch(url, { headers: { "User-Agent": "corvus-collect-hot" } });
  if (!res.ok) throw new Error(`HF ${org}: HTTP ${res.status}`);
  const arr = await res.json();
  let downloads = 0;
  for (const m of arr) downloads += m.downloads ?? 0;
  return downloads;
}

async function hfTrending() {
  const url = `https://huggingface.co/api/models?sort=trendingScore&limit=100`;
  const res = await fetch(url, { headers: { "User-Agent": "corvus-collect-hot" } });
  if (!res.ok) throw new Error(`HF trending: HTTP ${res.status}`);
  const arr = await res.json();
  return arr.map((m) => ({
    id: String(m.id ?? m.modelId ?? "").toLowerCase(),
    trending: m.trendingScore ?? 0,
  }));
}

function trendingForPattern(patternStr, trendingList) {
  const re = new RegExp(patternStr, "i");
  let sum = 0;
  for (const t of trendingList) if (re.test(t.id)) sum += t.trending;
  return sum;
}

function writeOut(entries) {
  const lines = entries
    .map((e) => `  [${JSON.stringify(e.pattern)}, ${e.score}],`)
    .join("\n");
  const out = `export const HOT_DATA: [string, number][] = [
${lines}
];
`;
  writeFileSync(OUT, out);
  console.log(`OK ${OUT} — ${entries.length} patterns`);
}

async function main() {
  let trendingList = [];
  try {
    trendingList = await hfTrending();
  } catch (e) {
    console.error(`! trending: ${e.message} — continuing with downloads only`);
  }

  const open = [];
  for (const fam of HF_FAMILIES) {
    try {
      const downloads = await hfDownloads(fam.org);
      const trending = trendingForPattern(fam.pattern, trendingList);
      open.push({ pattern: fam.pattern, downloads, trending });
      console.log(`  ${fam.org}: ${downloads} downloads, trending ${trending}`);
    } catch (e) {
      console.error(`! ${fam.org}: ${e.message} — skipping`);
    }
  }

  const logs = open.map((o) => Math.log10((o.downloads || 0) + 10));
  const maxLog = Math.max(...logs, 1);
  const minLog = Math.min(...logs, 0);
  const maxTrend = Math.max(...open.map((o) => o.trending || 0), 1);
  const openScored = open.map((o, i) => {
    const dl = (logs[i] - minLog) / (maxLog - minLog || 1);
    const tr = (o.trending || 0) / maxTrend;
    const raw = dl * 0.7 + tr * 0.3;
    return { pattern: o.pattern, score: round2(0.4 + raw * 0.45) };
  });

  const merged = [...CLOSED, ...openScored].sort(
    (a, b) => b.score - a.score || a.pattern.localeCompare(b.pattern)
  );
  writeOut(merged);
}

main().catch((e) => {
  console.error("collect-hot failed:", e);
  process.exit(1);
});

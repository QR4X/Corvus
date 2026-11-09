import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = "assets/svg";
const OUT = "src/ui/brandLogos.ts";
const r = (n) => Math.round(n * 1e4) / 1e4;

const WANTED = [
  { file: "openai.svg", id: "logo-openai" },
  { file: "claude-color.svg", id: "logo-anthropic" },
  { file: "gemini-color.svg", id: "logo-gemini" },
  { file: "openrouter.svg", id: "logo-openrouter" },
  { file: "nvidia-color.svg", id: "logo-nvidia" },
  { file: "ollama.svg", id: "logo-ollama" },
  { file: "meta-color.svg", id: "logo-meta" },
  { file: "deepseek-color.svg", id: "logo-deepseek" },
  { file: "mistral-color.svg", id: "logo-mistral" },
  { file: "qwen-color.svg", id: "logo-qwen" },
  { file: "zai.svg", id: "logo-zai" },
  { file: "bytedance-color.svg", id: "logo-bytedance" },
  { file: "flux.svg", id: "logo-flux" },
  { file: "stability-color.svg", id: "logo-stability" },
  { file: "nanobanana-color.svg", id: "logo-nanobanana" },
];

function flattenGradients(svg) {
  const flatColors = new Map();
  for (const g of svg.matchAll(
    /<linearGradient[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/linearGradient>/g
  )) {
    const [, id, body] = g;
    const stops = [...body.matchAll(/<stop[^>]*>/g)].map((s) => s[0]);
    if (stops.length === 0) continue;
    const transparent = stops.some((s) => /stop-opacity="0(\.0+)?"/.test(s));
    if (transparent) continue;
    const color = stops[0].match(/stop-color="([^"]+)"/)?.[1];
    if (color) flatColors.set(id, color);
  }
  if (flatColors.size === 0) return svg;

  let out = svg;
  for (const [id, color] of flatColors) {
    out = out.replaceAll(`url(#${id})`, color);
    out = out.replace(
      new RegExp(
        `<linearGradient[^>]*\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>[\\s\\S]*?</linearGradient>`
      ),
      ""
    );
  }
  return out.replace(/<defs>\s*<\/defs>/g, "");
}

const available = new Set(readdirSync(SRC).map((f) => f.toLowerCase()));
const files = WANTED.filter((w) => {
  const has = available.has(w.file.toLowerCase());
  if (!has) console.warn(`[logos] missing: ${w.file}`);
  return has;
});

const entries = [];
for (const { file: f, id } of files) {
  const raw = readFileSync(join(SRC, f), "utf8");

  const vbMatch = raw.match(/viewBox\s*=\s*"([^"]+)"/i);
  let [minX, minY, w, h] = vbMatch
    ? vbMatch[1].trim().split(/[\s,]+/).map(Number)
    : [0, 0, 24, 24];
  if (!w || !h || Number.isNaN(w) || Number.isNaN(h)) {
    [minX, minY, w, h] = [0, 0, 24, 24];
  }

  const scale = 100 / Math.max(w, h);
  const tx = (100 - w * scale) / 2 - minX * scale;
  const ty = (100 - h * scale) / 2 - minY * scale;

  let inner = raw
    .replace(/^[\s\S]*?<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();

  inner = flattenGradients(inner);
  inner = inner.replace(/\s+fill-rule="nonzero"/g, "");

  inner = inner
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");

  const svgOpen = raw.match(/<svg[^>]*>/i)?.[0] ?? "";
  const isMono = /fill\s*=\s*"currentColor"/i.test(svgOpen);
  const gFill = isMono ? ' fill="currentColor"' : "";
  const wrapped = `<g${gFill} transform="translate(${r(tx)} ${r(ty)}) scale(${r(
    scale
  )})">${inner}</g>`;

  entries.push({ id, wrapped });
}

const body = entries
  .map((e) => `  "${e.id}": \`${e.wrapped}\`,`)
  .join("\n");

const out = `import { addIcon } from "obsidian";

export const BRAND_LOGOS: Record<string, string> = {
${body}
};

export function registerBrandLogos(): void {
  for (const [id, svg] of Object.entries(BRAND_LOGOS)) {
    addIcon(id, svg);
  }
}
`;

writeFileSync(OUT, out, "utf8");
console.log(`[genLogos] ${entries.length} logos -> ${OUT}`);
console.log(entries.map((e) => "  " + e.id).join("\n"));

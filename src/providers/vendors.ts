import { tr } from "../i18n/tr";

export const MULTI_VENDOR_PROVIDERS = new Set(["openrouter", "nim"]);

const ALIASES: Record<string, string> = {
  "meta-llama": "meta",
  "deepseek-ai": "deepseek",
  mistralai: "mistral",
  "nv-mistralai": "mistral",
  "x-ai": "xai",
  "z-ai": "zai",
  zhipuai: "zai",
  alibaba: "qwen",
  "ibm-granite": "ibm",
  ai21labs: "ai21",
  "google-deepmind": "google",
};

const NAMES: Record<string, string> = {
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  meta: "Meta",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  xai: "xAI",
  nvidia: "NVIDIA",
  microsoft: "Microsoft",
  amazon: "Amazon",
  cohere: "Cohere",
  moonshotai: "Moonshot AI",
  zai: "Z.ai",
  perplexity: "Perplexity",
  ibm: "IBM",
  minimax: "MiniMax",
  baidu: "Baidu",
  tencent: "Tencent",
  bytedance: "ByteDance",
  nousresearch: "Nous Research",
  liquid: "Liquid AI",
  ai21: "AI21",
  inflection: "Inflection",
  "01-ai": "01.AI",
  allenai: "Ai2",
  "arcee-ai": "Arcee AI",
  stabilityai: "Stability AI",
  "black-forest-labs": "Black Forest Labs",
  writer: "Writer",
  upstage: "Upstage",
  sarvamai: "Sarvam AI",
  tiiuae: "TII",
  poolside: "Poolside",
  "baichuan-inc": "Baichuan",
  databricks: "Databricks",
  adept: "Adept",
  bigcode: "BigCode",
  aisingapore: "AI Singapore",
  snowflake: "Snowflake",
  servicenow: "ServiceNow",
  inception: "Inception",
  thudm: "THUDM",
  inclusionai: "inclusionAI",
  thinkingmachines: "Thinking Machines",
};

const ORDER = [
  "openrouter",
  "openai",
  "anthropic",
  "google",
  "meta",
  "mistral",
  "deepseek",
  "qwen",
  "xai",
  "nvidia",
  "microsoft",
  "amazon",
  "cohere",
  "moonshotai",
  "zai",
  "perplexity",
  "ibm",
];

export interface Vendor {

  key: string;

  name: string;
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function modelVendor(id: string): Vendor {
  const s = (id || "").trim().toLowerCase();
  const slash = s.indexOf("/");
  if (slash <= 0) return { key: "", name: tr("Other") };
  const raw = s.slice(0, slash).replace(/^~/, "");
  const key = ALIASES[raw] ?? raw;
  return { key, name: NAMES[key] ?? titleCase(key) };
}

export function compareVendors(a: Vendor, b: Vendor): number {
  if (!a.key !== !b.key) return a.key ? -1 : 1;
  const ia = ORDER.indexOf(a.key);
  const ib = ORDER.indexOf(b.key);
  if (ia !== ib) {
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  }
  return a.name.localeCompare(b.name);
}

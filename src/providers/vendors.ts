import { tr } from "../i18n/tr";

export const PROVIDERS_MULTI_FABRICANTE = new Set(["openrouter", "nim"]);

const APELIDOS: Record<string, string> = {
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

const NOMES: Record<string, string> = {
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

const ORDEM = [
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

export interface Fabricante {

  chave: string;

  nome: string;
}

function titulo(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function fabricante(id: string): Fabricante {
  const s = (id || "").trim().toLowerCase();
  const barra = s.indexOf("/");
  if (barra <= 0) return { chave: "", nome: tr("Other") };
  const cru = s.slice(0, barra).replace(/^~/, "");
  const chave = APELIDOS[cru] ?? cru;
  return { chave, nome: NOMES[chave] ?? titulo(chave) };
}

export function compararFabricantes(a: Fabricante, b: Fabricante): number {
  if (!a.chave !== !b.chave) return a.chave ? -1 : 1;
  const ia = ORDEM.indexOf(a.chave);
  const ib = ORDEM.indexOf(b.chave);
  if (ia !== ib) {
    if (ia < 0) return 1;
    if (ib < 0) return -1;
    return ia - ib;
  }
  return a.nome.localeCompare(b.nome);
}

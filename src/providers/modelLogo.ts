import { getModelFamily } from "./modelFamily";

const MARCAS: Record<string, string> = {
  openai: "logo-openai",
  anthropic: "logo-anthropic",
  google: "logo-gemini",
  gemini: "logo-gemini",
  nvidia: "logo-nvidia",
  nim: "logo-nvidia",
  ollama: "logo-ollama",
  openrouter: "logo-openrouter",

  meta: "logo-meta",
  "meta-llama": "logo-meta",
  llama: "logo-meta",
  deepseek: "logo-deepseek",
  "deepseek-ai": "logo-deepseek",
  mistral: "logo-mistral",
  mistralai: "logo-mistral",
  qwen: "logo-qwen",
  alibaba: "logo-qwen",
  "z-ai": "logo-zai",
  zai: "logo-zai",
  zhipu: "logo-zai",
  bytedance: "logo-bytedance",
  "black-forest-labs": "logo-flux",
  stabilityai: "logo-stability",
  stability: "logo-stability",
};

export function vendorDoModelo(id: string): string {
  const s = (id || "").trim().toLowerCase();
  const barra = s.indexOf("/");
  return barra > 0 ? s.slice(0, barra) : "";
}

export function modelLogo(id: string): string {
  const mark = MARCAS[vendorDoModelo(id)];
  if (mark) return mark;

  const s = (id || "").toLowerCase();
  if (/(^|[^a-z])(gpt|o[1-9]|dall-e)/.test(s)) return "logo-openai";
  if (s.includes("claude")) return "logo-anthropic";

  if (/(nano-?banana)/.test(s)) return "logo-nanobanana";
  if (s.includes("gemini") || s.includes("gemma")) return "logo-gemini";
  if (s.includes("nemotron")) return "logo-nvidia";

  if (s.includes("llama")) return "logo-meta";
  if (s.includes("deepseek")) return "logo-deepseek";
  if (/(mistral|mixtral|codestral|ministral|pixtral|magistral)/.test(s))
    return "logo-mistral";
  if (s.includes("qwen")) return "logo-qwen";
  if (/\bglm\b/.test(s)) return "logo-zai";
  if (s.includes("flux")) return "logo-flux";
  if (/(stable-?diffusion|sdxl)/.test(s)) return "logo-stability";
  return getModelFamily(id).icon;
}

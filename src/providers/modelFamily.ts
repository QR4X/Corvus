import { mark } from "../i18n/tr";

export interface ModelFamily {
  id: string;
  label: string;

  color: string;

  icon: string;
}

const FAMILIES: [RegExp, ModelFamily][] = [

  [/openrouter\/auto/, { id: "router", label: "Auto Router", color: "#6366f1", icon: "sparkles" }],

  [/claude-opus/, { id: "opus", label: "Opus", color: "#d97757", icon: "crown" }],
  [/claude-sonnet/, { id: "sonnet", label: "Sonnet", color: "#c98a4a", icon: "feather" }],
  [/claude-haiku/, { id: "haiku", label: "Haiku", color: "#e0a86a", icon: "wind" }],
  [/claude-fable/, { id: "fable", label: "Fable", color: "#b06ad9", icon: "sparkles" }],
  [/claude-mythos/, { id: "mythos", label: "Mythos", color: "#8a5cf0", icon: "gem" }],
  [/claude/, { id: "claude", label: "Claude", color: "#cc7a52", icon: "asterisk" }],

  [/(dall-e|gpt-image)/, { id: "dalle", label: "DALL·E", color: "#f472b6", icon: "image" }],
  [/(tts|whisper|audio)/, { id: "oai-audio", label: mark("Audio"), color: "#4cc9f0", icon: "audio-lines" }],
  [/(^|[^a-z])o[1-9]/, { id: "o-series", label: "o-series", color: "#7aa2ff", icon: "brain" }],
  [/gpt-5/, { id: "gpt5", label: "GPT-5", color: "#10a37f", icon: "hexagon" }],
  [/gpt-4o/, { id: "gpt4o", label: "GPT-4o", color: "#19c37d", icon: "circle-dot" }],
  [/gpt-4/, { id: "gpt4", label: "GPT-4", color: "#2bb189", icon: "circle" }],
  [/gpt/, { id: "gpt", label: "GPT", color: "#1aa179", icon: "circle" }],

  [/(imagen|nano-?banana|gemini[\w.-]*image)/, { id: "imagen", label: "Imagen", color: "#ec4899", icon: "image" }],
  [/(veo|sora)/, { id: "video", label: mark("Video"), color: "#a855f7", icon: "clapperboard" }],
  [/gemini-[\d.]*flash/, { id: "gem-flash", label: "Flash", color: "#5b9bff", icon: "zap" }],
  [/gemini-[\d.]*pro|gemini-3/, { id: "gem-pro", label: "Gemini Pro", color: "#4285f4", icon: "sparkle" }],
  [/(gemini|gemma)/, { id: "gemini", label: "Gemini", color: "#4285f4", icon: "sparkle" }],

  [/deepseek/, { id: "deepseek", label: "DeepSeek", color: "#4d6bfe", icon: "anchor" }],
  [/qwen/, { id: "qwen", label: "Qwen", color: "#a855f7", icon: "feather" }],
  [/(llama|meta-)/, { id: "llama", label: "Llama", color: "#1d7efd", icon: "flame" }],
  [/(codestral|magistral|mistral|mixtral|ministral|pixtral)/, { id: "mistral", label: "Mistral", color: "#ff7000", icon: "wind" }],
  [/grok/, { id: "grok", label: "Grok", color: "#9aa0a6", icon: "slash" }],
  [/(nemotron|nvidia)/, { id: "nvidia", label: "Nemotron", color: "#76b900", icon: "cpu" }],
];

const FALLBACK: ModelFamily = {
  id: "other",
  label: mark("Other"),
  color: "#8a8a96",
  icon: "box",
};

export function getModelFamily(model: string): ModelFamily {
  const id = (model || "").toLowerCase();
  for (const [re, fam] of FAMILIES) if (re.test(id)) return fam;
  return FALLBACK;
}

export function getFamilyRank(familyId: string): number {
  const i = FAMILIES.findIndex(([, f]) => f.id === familyId);
  return i === -1 ? FAMILIES.length : i;
}

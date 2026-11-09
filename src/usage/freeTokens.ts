export const FREE_TOKENS_AS_OF = "2026-06";

export interface OpenAIFreeAllowance {

  eligible: boolean;

  bigPerDay: number;

  miniPerDay: number;

  imageEligible: boolean;
}

const MINI_MODELS = [
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o-mini",
  "o1-mini",
  "o4-mini",
  "o3-mini",
  "codex-mini",
];
const BIG_MODELS = ["gpt-5", "gpt-4.1", "gpt-4o", "chatgpt-4o", "o1", "o3"];

export function openaiFreeAllowance(
  tier: number,
  dataSharing: boolean
): OpenAIFreeAllowance {
  if (!dataSharing || tier < 1) {
    return { eligible: false, bigPerDay: 0, miniPerDay: 0, imageEligible: false };
  }
  const low = tier <= 2;
  return {
    eligible: true,
    bigPerDay: low ? 250_000 : 1_000_000,
    miniPerDay: low ? 2_500_000 : 10_000_000,
    imageEligible: false,
  };
}

export function openaiFreeTierForModel(model: string): "big" | "mini" | null {
  const m = (model || "").toLowerCase();
  if (MINI_MODELS.some((p) => m.startsWith(p))) return "mini";

  if (/^gpt-5(\.\d+)?-(mini|nano)/.test(m)) return "mini";
  if (BIG_MODELS.some((p) => m.startsWith(p))) return "big";
  return null;
}

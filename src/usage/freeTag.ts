import { openaiFreeAllowance, openaiFreeTierForModel } from "./freeTokens";
import { uiLocale, tr } from "../i18n/tr";

export interface FreeTag {

  kind: "always" | "daily" | "offer";

  perDay?: number;

  label: string;

  detail: string;
}

export function compactTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function gratisDeVerdade(
  model: string,
  livres: readonly string[] | undefined,
  palpite: boolean
): boolean {

  if (/:free$/i.test(model)) return true;
  if (!livres || livres.length === 0) return palpite;
  const igual = (s: string) => s.toLowerCase().replace(/_/g, ".");
  const alvo = igual(model);
  return livres.some((l) => igual(l) === alvo);
}

function milhar(n: number): string {
  return n.toLocaleString(uiLocale());
}

export function geminiTemTierGratis(model: string): boolean {
  const id = (model || "").toLowerCase().replace(/^(models|google)\//, "");
  if (/(image|imagen|veo|lyria|omni)/.test(id)) return false;
  if (/^gemini-\d+(\.\d+)?-flash/.test(id)) return true;
  if (/^gemini-2\.5-pro(-|$)/.test(id)) return !/tts/.test(id);
  if (/^gemini-\d+(\.\d+)?-(live|transcribe)/.test(id)) return true;
  if (/^gemini-embedding-[2-9]/.test(id)) return true;
  if (/^gemma-/.test(id)) return true;
  if (/^gemini-robotics/.test(id)) return true;
  return false;
}

export function freeTag(
  provider: string,
  model: string,
  opts: {

    free: boolean;

    dataSharing: boolean;

    tier: number;

    cota?: { limit: number; remaining?: number };
  }
): FreeTag | null {
  const pool = provider === "openai" ? openaiFreeTierForModel(model) : null;
  if (pool) {

    const allow = openaiFreeAllowance(Math.max(opts.tier, 1), true);
    const perDay = pool === "mini" ? allow.miniPerDay : allow.bigPerDay;
    const qtd = compactTokens(perDay);
    if (opts.dataSharing) {
      return {
        kind: "daily",
        perDay,
        label: tr("{n}/day", { n: qtd }),
        detail: tr(
          "{n} tokens a day at no cost while you share API data with OpenAI. Past that, this model is billed normally — and the quota counts ALL your OpenAI API use, not just this vault.",
          { n: qtd }
        ),
      };
    }

    return {
      kind: "offer",
      perDay,
      label: tr("+{n}/day", { n: qtd }),
      detail: tr(
        "Turn on data sharing in OpenAI's Data controls to get {n} tokens a day here at no cost.",
        { n: qtd }
      ),
    };
  }

  if (provider === "gemini") {
    if (!geminiTemTierGratis(model)) return null;
    return {
      kind: "offer",
      label: tr("free tier"),
      detail: tr(
        "No cost on the Gemini API's free tier — a project without billing turned on, where Google may use what you send to improve its products — within its rate limits. With billing on, this model is charged."
      ),
    };
  }
  if (!opts.free) return null;

  if (provider === "openrouter") {
    const c = opts.cota;
    const frase = c
      ? c.limit >= 1000
        ? tr(
            "No cost. OpenRouter's free models share 20 requests a minute and {limit} a day on this key.",
            { limit: milhar(c.limit) }
          )
        : tr(
            "No cost. OpenRouter's free models share 20 requests a minute and {limit} a day on this key — 1,000 once you've bought $10 in credits.",
            { limit: milhar(c.limit) }
          )
      : tr(
          "No cost. OpenRouter's free models share 20 requests a minute and 50 a day (1,000 once you've bought $10 in credits)."
        );
    const resta =
      c?.remaining != null
        ? tr("{n} were left when you fetched.", { n: milhar(c.remaining) })
        : "";
    return {
      kind: "always",
      label: c ? tr("free · {n}/day", { n: milhar(c.limit) }) : tr("free"),
      detail: [
        frase,
        resta,
        tr("A free variant can run on a different host, with a smaller context than the paid one."),
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (provider === "nim") {
    return {
      kind: "always",
      label: tr("free · 40/min"),
      detail: tr(
        "A Free Endpoint in NVIDIA's API catalog: no cost with your developer key, for development and testing, up to 40 requests a minute. Models without this mark aren't part of the free tier."
      ),
    };
  }
  if (provider === "ollama") {
    return {
      kind: "always",
      label: tr("free"),
      detail: tr("Runs on your own machine — there's no bill at all."),
    };
  }
  return {
    kind: "always",
    label: tr("free"),
    detail: tr("No cost — this model has no billing at all."),
  };
}

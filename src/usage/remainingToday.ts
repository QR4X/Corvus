import type { EstadoDaChave } from "../providers/openrouter";
import { tr } from "../i18n/tr";
import { geminiTemTierGratis } from "./freeTag";
import { openaiFreeAllowance, openaiFreeTierForModel } from "./freeTokens";
import {
  faltaParaVirar,
  inicioDoDia,
  modelosDesde,
  somarDesde,
  type LivroDoDia,
} from "./dailyLedger";
import { gastoDesde } from "./dailySpend";

export const CHAVE_LIMITE_GASTO = "__gasto";

export const AI_STUDIO_LIMITES = "https://aistudio.google.com/rate-limit";

const PACIFICO = "America/Los_Angeles";

export function chaveDoLimite(provider: string, model: string): string {
  return `${provider}\u0001${model}`;
}

export type Unidade = "tokens" | "requests" | "usd";

export interface Medidor {
  id: string;

  rotulo: string;

  modelo?: string;
  usado: number;

  limite?: number;

  restante?: number;
  unidade: Unidade;

  fonte: "live" | "local";

  nota?: string;

  limiteEditavel?: string;
}

export interface Cartao {
  provider: "spend" | "openai" | "gemini" | "openrouter" | "nim";
  nome: string;

  viraEm: number | null;

  viraOnde?: string;

  semDia?: string;
  medidores: Medidor[];

  vazio?: string;

  nota?: string;

  link?: { rotulo: string; url: string };

  credito?: { restante: number | null; gastoHoje?: number; volta?: string };
}

export interface EntradaDoDia {
  livro: LivroDoDia;
  agora: Date;

  comChave: (provider: string) => boolean;
  openai: { dataSharing: boolean; tier: number };

  limites: Record<string, number>;

  cotaOpenRouter?: { limit: number; remaining?: number };

  chaveOpenRouter?: EstadoDaChave | null;

  fusoLocal?: string;

  limiteGasto?: number;

  travarNoLimite?: boolean;
}

const sobra = (limite: number | undefined, usado: number): number | undefined =>
  limite == null ? undefined : Math.max(0, limite - usado);

function tetoInformado(limites: Record<string, number>, chave: string): number | undefined {
  const v = limites[chave];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
}

function fusoDaMaquina(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function remainingToday(e: EntradaDoDia): Cartao[] {
  const { livro, agora } = e;
  const cartoes: Cartao[] = [];
  const meiaNoiteUtc = inicioDoDia(agora, "UTC");
  const viraUtc = faltaParaVirar(agora, "UTC");
  const usouDesde = (provider: string, desde: Date) =>
    somarDesde(livro, desde, (p) => p === provider).r > 0;
  const fuso = e.fusoLocal ?? fusoDaMaquina();
  const meiaNoiteLocal = inicioDoDia(agora, fuso);

  const gasto = gastoDesde(livro, meiaNoiteLocal);
  const limiteGasto = e.limiteGasto && e.limiteGasto > 0 ? e.limiteGasto : 0;
  if (limiteGasto > 0 || gasto.total > 0) {
    cartoes.push({
      provider: "spend",
      nome: tr("Paid models"),
      viraEm: faltaParaVirar(agora, fuso),
      viraOnde: tr("midnight, your time"),
      medidores: [
        {
          id: "spend-today",
          rotulo: tr("Spent today"),
          usado: gasto.total,
          limite: limiteGasto || undefined,
          restante: limiteGasto ? Math.max(0, limiteGasto - gasto.total) : undefined,
          unidade: "usd",
          fonte: "local",
          limiteEditavel: CHAVE_LIMITE_GASTO,
        },
      ],
      nota: [
        tr("Counted in this vault from public token prices. Gemini counts at paid prices, so a free-tier project may cost less."),
        gasto.semPreco > 0
          ? gasto.semPreco === 1
            ? tr("1 request on models without a public price isn't included.")
            : tr("{n} requests on models without a public price aren't included.", { n: gasto.semPreco })
          : "",
        limiteGasto > 0
          ? e.travarNoLimite
            ? tr("At the limit, paid models pause until midnight.")
            : tr("At the limit you get a heads-up; turn on “Stop paid models at the limit” in settings to pause them.")
          : tr("Set a limit to get a heads-up at 80% and 100%."),
        tr("Resets at midnight, your time."),
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  if (e.comChave("openai") || usouDesde("openai", meiaNoiteUtc)) {
    const cota = openaiFreeAllowance(e.openai.tier, e.openai.dataSharing);
    const base: Cartao = {
      provider: "openai",
      nome: "OpenAI",
      viraEm: viraUtc,
      viraOnde: tr("00:00 UTC"),
      medidores: [],
    };
    if (!e.openai.dataSharing) {
      base.vazio = tr(
        "No free tokens to track. If your organization shares API data with OpenAI, turn that on in settings."
      );
      base.viraEm = null;
    } else if (!cota.eligible) {
      base.vazio = tr("Free tokens start at usage tier 1.");
      base.viraEm = null;
    } else {
      const balde = (qual: "big" | "mini") => {
        const s = somarDesde(
          livro,
          meiaNoiteUtc,
          (p, m) => p === "openai" && openaiFreeTierForModel(m) === qual
        );
        return s.i + s.o;
      };
      const grandes = balde("big");
      const minis = balde("mini");
      base.medidores = [
        {
          id: "openai-big",
          rotulo: tr("Flagship models"),
          usado: grandes,
          limite: cota.bigPerDay,
          restante: sobra(cota.bigPerDay, grandes),
          unidade: "tokens",
          fonte: "local",
        },
        {
          id: "openai-mini",
          rotulo: tr("Mini models"),
          usado: minis,
          limite: cota.miniPerDay,
          restante: sobra(cota.miniPerDay, minis),
          unidade: "tokens",
          fonte: "local",
        },
      ];
      base.nota = tr(
        "Free daily tokens for sharing API data with OpenAI. Flagship: GPT-5, GPT-4.1, GPT-4o, o1, o3. Mini: their mini and nano versions, and o4-mini. Counted in this vault: other apps on the same OpenAI organization draw from the same quota, so the real number may be lower. Resets at 00:00 UTC."
      );
    }
    cartoes.push(base);
  }

  const meiaNoitePacifico = inicioDoDia(agora, PACIFICO);
  const usadosGemini = modelosDesde(livro, meiaNoitePacifico, "gemini");
  if (e.comChave("gemini") || usadosGemini.length > 0) {

    const prefixo = chaveDoLimite("gemini", "");
    const soComTeto = Object.keys(e.limites)
      .filter((k) => k.startsWith(prefixo))
      .map((k) => k.slice(prefixo.length))
      .filter((m) => m && tetoInformado(e.limites, chaveDoLimite("gemini", m)) != null)
      .filter((m) => !usadosGemini.some((u) => u.model === m))
      .sort((a, b) => a.localeCompare(b));
    const modelos = [
      ...usadosGemini.map((u) => ({ model: u.model, r: u.r })),
      ...soComTeto.map((model) => ({ model, r: 0 })),
    ];
    cartoes.push({
      provider: "gemini",
      nome: "Gemini",
      viraEm: faltaParaVirar(agora, PACIFICO),
      viraOnde: tr("midnight Pacific"),
      medidores: modelos.map(({ model, r }): Medidor => {
        const chave = chaveDoLimite("gemini", model);
        const limite = tetoInformado(e.limites, chave);
        return {
          id: `gemini:${model}`,
          rotulo: model,
          modelo: model,
          usado: r,
          limite,
          restante: sobra(limite, r),
          unidade: "requests",
          fonte: "local",
          limiteEditavel: chave,
          ...(geminiTemTierGratis(model) ? {} : { nota: tr("Paid only") }),
        };
      }),
      vazio: modelos.length === 0 ? tr("Nothing used since midnight Pacific.") : undefined,
      nota: tr(
        "Requests per day, per model and per Google Cloud project. The free tier only exists on projects without billing, and Google shows its numbers in AI Studio, not in the docs: set each model's limit here to see what's left. Resets at midnight Pacific."
      ),
      link: { rotulo: tr("Your limits in AI Studio"), url: AI_STUDIO_LIMITES },
    });
  }

  if (e.comChave("openrouter") || usouDesde("openrouter", meiaNoiteUtc)) {

    const local = somarDesde(
      livro,
      meiaNoiteUtc,
      (p, m) => p === "openrouter" && m.endsWith(":free")
    ).r;
    const viva = e.chaveOpenRouter ?? null;
    const g = viva?.gratis;
    let medidor: Medidor;
    if (g && (g.usados != null || g.restantes != null)) {
      const usado = g.usados ?? Math.max(0, g.limite - (g.restantes ?? g.limite));
      medidor = {
        id: "openrouter-free",
        rotulo: tr("Free models"),
        usado,
        limite: g.limite,
        restante: g.restantes ?? sobra(g.limite, usado),
        unidade: "requests",
        fonte: "live",
      };
    } else {
      const limite = g?.limite ?? e.cotaOpenRouter?.limit;
      medidor = {
        id: "openrouter-free",
        rotulo: tr("Free models"),
        usado: local,
        limite,
        restante: sobra(limite, local),
        unidade: "requests",
        fonte: "local",
      };
    }
    const cartao: Cartao = {
      provider: "openrouter",
      nome: "OpenRouter",
      viraEm: viraUtc,
      viraOnde: tr("00:00 UTC"),
      medidores: [medidor],
      nota: [
        medidor.fonte === "live"
          ? tr("Counted by OpenRouter for this key, across every app that uses it.")
          : tr("Counted on this device: OpenRouter didn't answer, so other apps using this key aren't included."),
        tr(
          "Models ending in :free allow 20 requests a minute and 50 a day, or 1,000 a day once you've bought $10 in credits. Resets at 00:00 UTC."
        ),
      ].join(" "),
    };
    if (viva && (viva.creditoRestante !== undefined || viva.gastoHoje !== undefined)) {
      cartao.credito = {
        restante: viva.creditoRestante ?? null,
        ...(viva.gastoHoje !== undefined ? { gastoHoje: viva.gastoHoje } : {}),
        ...(viva.creditoVolta ? { volta: viva.creditoVolta } : {}),
      };
    }
    cartoes.push(cartao);
  }

  if (e.comChave("nim") || usouDesde("nim", meiaNoiteLocal)) {
    const hoje = somarDesde(livro, meiaNoiteLocal, (p) => p === "nim").r;
    cartoes.push({
      provider: "nim",
      nome: "NVIDIA NIM",
      viraEm: null,
      semDia: tr("no daily cap"),
      medidores: [
        {
          id: "nim-today",
          rotulo: tr("All models"),
          usado: hoje,
          unidade: "requests",
          fonte: "local",
        },
      ],
      nota: tr(
        "Free endpoints allow 40 requests a minute. NVIDIA publishes no daily cap, so this is just what you used today (your local day)."
      ),
    });
  }

  return cartoes;
}

export function emQuanto(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "<1m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fracaoQueSobra(m: Medidor): number | null {
  if (m.limite == null || m.limite <= 0 || m.restante == null) return null;
  return Math.max(0, Math.min(1, m.restante / m.limite));
}

export function nivel(m: Medidor): "ok" | "baixo" | "fim" | null {
  const f = fracaoQueSobra(m);
  if (f == null) return null;
  if (m.restante === 0) return "fim";
  return f <= 0.1 ? "baixo" : "ok";
}

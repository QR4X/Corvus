import { Modal, Notice, setIcon, ToggleComponent, type App } from "obsidian";
import {
  DEFAULT_EFFORT_CONFIGS,
  EFFORT_LABELS,
  effortNumbers,
  resolveEffortConfig,
  tokensCurtos,
  type EffortConfig,
  type EffortLevel,
} from "../../core/effort";
import { ConfirmModal } from "../modals";
import { uiLocale, mark, tr } from "../../i18n/tr";

type Overrides = Partial<Record<EffortLevel, Partial<EffortConfig>>>;

export interface CampoDeEsforco {
  key: keyof EffortConfig;

  name: string;

  desc: string;

  icone: string;
  tipo: "numero" | "chave";
  min?: number;
  max?: number;

  paradas?: number[];

  mostrar?: (v: number) => string;

  quando?: (cfg: EffortConfig) => boolean;
}

function de(ini: number, fim: number, passo = 1): number[] {
  const out: number[] = [];
  for (let i = 0; ini + i * passo <= fim + 1e-9; i++) {
    out.push(Math.round((ini + i * passo) * 10) / 10);
  }
  return out;
}

export const CAMPOS_DE_ESFORCO: CampoDeEsforco[] = [
  {
    key: "maxTokens",
    icone: "message-square-text",
    name: mark("Reply length"),
    desc: mark(
      "The longest a reply can get, in tokens — longer costs more. No cap lets it use up to the share of context below. Models that think first (GPT-5, the o-series, Claude 5, Fable, Gemini 2.5 and 3, DeepSeek V4) spend part of it thinking, so the plugin requests at least 16k (32k on High, 64k from Extra high) where the model ceiling permits. Where the provider allows, the level also sets how hard they think. Existing model ceilings still apply (8k for DeepSeek), even with No cap."
    ),
    tipo: "numero",
    min: 0,
    max: 200000,
    paradas: [
      256, 512, 1000, 1500, 2048, 3000, 4000, 6000, 8000, 12000, 16000, 24000, 32000,
      48000, 64000, 100000, 128000, 200000, 0,
    ],
    mostrar: (v) => (v === 0 ? tr("No cap") : tr("{n} tokens", { n: tokensCurtos(v) })),
  },
  {
    key: "contextReservePercent",
    icone: "pie-chart",
    name: mark("Share of context"),
    desc: mark(
      "With no cap on the reply, how much of the model's context window it may fill. The rest is kept for your message, the chat so far and the notes. The model's own output ceiling still applies on top."
    ),
    tipo: "numero",
    min: 10,
    max: 95,
    paradas: de(10, 95, 5),
    mostrar: (v) => tr("up to {n}%", { n: v }),
    quando: (cfg) => cfg.maxTokens === 0,
  },
  {
    key: "temperature",
    icone: "thermometer",
    name: mark("Temperature"),
    desc: mark(
      "How adventurous the wording is: low sticks to the likeliest answer, high is more creative and less predictable. Provider default sends nothing. Not every model takes it — the newest Claude (Fable, Opus 4.7+, Sonnet 5+) and the reasoning models (GPT-5, the o-series, DeepSeek R1) always use their own, so the plugin leaves it out for them. Claude goes up to 1 and NVIDIA from 0.01 to 1 — values outside are brought in."
    ),
    tipo: "numero",
    min: -1,
    max: 2,
    paradas: [-1, ...de(0, 2, 0.1)],
    mostrar: (v) => (v < 0 ? tr("Provider default") : String(v)),
  },
  {
    key: "toolRetryOnError",
    icone: "wrench",
    name: mark("Tool retries"),
    desc: mark(
      "How many times the Agent retries a tool that failed for a passing reason: network, timeout, a locked file. A wrong path is never retried."
    ),
    tipo: "numero",
    min: 0,
    max: 20,
    paradas: [...de(0, 10), 12, 15, 20],
    mostrar: (v) =>
      v === 0 ? tr("None") : v === 1 ? tr("1 retry") : tr("{n} retries", { n: v }),
  },
  {
    key: "loopDetectionWindow",
    icone: "shield",
    name: mark("Loop guard"),
    desc: mark(
      "How many identical tool calls in a row make the Agent stop and rethink, so it doesn't spin in place. Off turns the check off."
    ),
    tipo: "numero",
    min: 0,
    max: 20,
    paradas: de(0, 20),
    mostrar: (v) =>
      v === 0 ? tr("Off") : v === 1 ? tr("1 in a row") : tr("{n} in a row", { n: v }),
  },
  {
    key: "parallelToolCalls",
    icone: "split",
    name: mark("Run tools in parallel"),
    desc: mark(
      "When the Agent asks for several tools at once, run them together instead of one after another. Faster; off is easier to follow."
    ),
    tipo: "chave",
  },
  {
    key: "vaultTopK",
    icone: "files",
    name: mark("Vault Q&A notes"),
    desc: mark(
      "How many of your notes Vault Q&A pulls in to answer each question. More notes, wider view, more tokens. On a local Ollama model the plugin grows the context window to fit what's sent (8k, 16k, 32k…, up to what the model supports), so nothing gets cut — a bigger window just uses more memory."
    ),
    tipo: "numero",
    min: 1,
    max: 100,
    paradas: [...de(1, 20), 25, 30, 40, 50, 75, 100],
    mostrar: (v) => (v === 1 ? tr("1 note") : tr("{n} notes", { n: v })),
  },
  {
    key: "vaultExcerptChars",
    icone: "type",
    name: mark("Characters per note"),
    desc: mark(
      "How much of each note Vault Q&A pulls in goes into the context, in characters. More text, more detail, more tokens."
    ),
    tipo: "numero",
    min: 100,
    max: 10000,
    paradas: [
      100, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000,
      8000, 10000,
    ],
    mostrar: (v) => tr("{n} chars", { n: v.toLocaleString(uiLocale()) }),
  },
];

export function limitar(valor: number, campo: CampoDeEsforco): number {
  const min = campo.min ?? -Infinity;
  const max = campo.max ?? Infinity;
  return Math.max(min, Math.min(max, valor));
}

function posicao(campo: CampoDeEsforco, v: number): number {
  return v === 0 && campo.paradas?.[campo.paradas.length - 1] === 0 ? Infinity : v;
}

export function paradasCom(campo: CampoDeEsforco, valor: number): number[] {
  const base = campo.paradas ?? [];
  if (base.includes(valor)) return base;
  const alvo = posicao(campo, valor);
  const i = base.findIndex((p) => posicao(campo, p) > alvo);
  return i < 0 ? [...base, valor] : [...base.slice(0, i), valor, ...base.slice(i)];
}

export function comCampo(
  overrides: Overrides,
  level: EffortLevel,
  key: keyof EffortConfig,
  valor: number | boolean | undefined
): Overrides {
  const atual: Partial<EffortConfig> = {};
  for (const campo of CAMPOS_DE_ESFORCO) {
    const v = overrides[level]?.[campo.key];
    if (v !== undefined) Object.assign(atual, { [campo.key]: v });
  }
  if (valor === undefined || valor === DEFAULT_EFFORT_CONFIGS[level][key]) {
    delete atual[key];
  } else {
    (atual as Record<string, number | boolean>)[key] = valor;
  }
  const out: Overrides = { ...overrides };
  if (Object.keys(atual).length === 0) delete out[level];
  else out[level] = atual;
  return out;
}

export function nivelEditado(overrides: Overrides | undefined, level: EffortLevel): boolean {
  return CAMPOS_DE_ESFORCO.some((campo) => overrides?.[level]?.[campo.key] !== undefined);
}

export function resumoDoNivel(overrides: Overrides | undefined, level: EffortLevel): string {
  const cfg = resolveEffortConfig(level, overrides);
  const temp =
    cfg.temperature < 0
      ? tr("provider temperature")
      : tr("temperature {t}", { t: cfg.temperature });
  const notas =
    cfg.vaultTopK === 1 ? tr("1 note") : tr("{n} notes", { n: cfg.vaultTopK });
  return `${effortNumbers(cfg)} · ${temp} · ${notas}`;
}

export interface Gravador {
  settings: { effortConfigs: Overrides };
  saveSettings(): Promise<void>;
}

interface LinhaViva {
  campo: CampoDeEsforco;
  el: HTMLElement;

  repor(): void;
}

export class EffortLevelModal extends Modal {
  private linhas: LinhaViva[] = [];

  private restaurarEl: HTMLButtonElement | null = null;

  private dica: { el: HTMLElement; botao: HTMLElement } | null = null;

  constructor(
    app: App,
    private readonly plugin: Gravador,
    private readonly level: EffortLevel,
    private readonly aoFechar: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("corvus-effort-modal");
    this.titleEl.setText(tr("{level} effort", { level: tr(EFFORT_LABELS[this.level]) }));
    this.desenhar();
    this.montarRestaurar();

    this.modalEl.addEventListener(
      "pointerdown",
      (e) => {
        if (this.dica && !this.dica.botao.contains(e.target as Node)) this.fecharDica();
      },
      true
    );
  }

  private alternarDica(botao: HTMLButtonElement, topo: HTMLElement, campo: CampoDeEsforco): void {
    const mesma = this.dica?.botao === botao;
    this.fecharDica();
    if (mesma) return;
    const el = topo.createDiv({
      cls: "corvus-esf-dica",
      text: tr(campo.desc),
      attr: { id: `corvus-esf-dica-${campo.key}`, role: "note" },
    });
    botao.setAttribute("aria-expanded", "true");
    this.dica = { el, botao };
    if (el.getBoundingClientRect().bottom > this.contentEl.getBoundingClientRect().bottom) {
      el.addClass("is-acima");
    }
  }

  private fecharDica(): void {
    if (!this.dica) return;
    this.dica.el.remove();
    this.dica.botao.setAttribute("aria-expanded", "false");
    this.dica = null;
  }

  onClose(): void {
    this.contentEl.empty();
    this.aoFechar();
  }

  private editado(): Partial<EffortConfig> {
    return this.plugin.settings.effortConfigs?.[this.level] ?? {};
  }

  private async gravar(key: keyof EffortConfig, valor: number | boolean | undefined) {
    this.plugin.settings.effortConfigs = comCampo(
      this.plugin.settings.effortConfigs ?? {},
      this.level,
      key,
      valor
    );
    await this.plugin.saveSettings();
    this.pintarRestaurar();
  }

  private mostrarDependentes(cfg: EffortConfig): void {
    for (const l of this.linhas) {
      if (l.campo.quando) l.el.toggleClass("is-hidden", !l.campo.quando(cfg));
    }
  }

  private desenhar(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.linhas = [];
    const lista = contentEl.createDiv({ cls: "corvus-esf" });
    for (const campo of CAMPOS_DE_ESFORCO) {
      this.linhas.push(
        campo.tipo === "chave" ? this.linhaDeChave(lista, campo) : this.linhaDeNumero(lista, campo)
      );
    }
    this.mostrarDependentes(resolveEffortConfig(this.level, this.plugin.settings.effortConfigs));
  }

  private montarRestaurar(): void {
    const restaurar = this.modalEl.createEl("button", {
      cls: "corvus-esf-restaurar clickable-icon",
      attr: {
        type: "button",
        "aria-label": tr("Restore {level}'s defaults", {
          level: tr(EFFORT_LABELS[this.level]),
        }),
      },
    });
    setIcon(restaurar.createSpan({ cls: "corvus-esf-restaurar-ico" }), "rotate-ccw");
    restaurar.createSpan({ text: tr("Restore") });
    restaurar.addEventListener("click", () => void this.restaurarTudo());
    this.restaurarEl = restaurar;
    this.pintarRestaurar();

    const x = Array.from(this.modalEl.children).find(
      (el): el is HTMLElement =>
        el !== restaurar &&
        (el.hasClass("modal-close-button") || el.hasClass("modal-header-button"))
    );
    if (!x) {

      this.titleEl.parentElement?.appendChild(restaurar);
      restaurar.addClass("is-solto");
      return;
    }
    const rtl = this.modalEl.win.getComputedStyle(this.modalEl).direction === "rtl";

    const antesDoX = rtl ? x.offsetLeft + x.offsetWidth : this.modalEl.clientWidth - x.offsetLeft;
    restaurar.setCssStyles({
      top: `${x.offsetTop}px`,
      height: `${x.offsetHeight}px`,
      insetInlineEnd: `${antesDoX + 4}px`,
    });

    this.titleEl.parentElement?.setCssStyles({
      paddingInlineEnd: `${antesDoX + 4 + restaurar.offsetWidth + 8}px`,
    });
  }

  private pintarRestaurar(): void {
    if (this.restaurarEl) {
      this.restaurarEl.disabled = !nivelEditado(this.plugin.settings.effortConfigs, this.level);
    }
  }

  private async restaurarTudo(): Promise<void> {
    const nome = tr(EFFORT_LABELS[this.level]);
    const ok = await new ConfirmModal(this.app, {
      title: tr("Restore {level} to its defaults?", { level: nome }),
      body: tr(
        "Every setting of {level} goes back to {level}'s own defaults. The other levels keep theirs.",
        { level: nome }
      ),
      confirmLabel: tr("Restore"),
      danger: true,
    }).openAndWait();
    if (!ok) return;
    const resto = { ...(this.plugin.settings.effortConfigs ?? {}) };
    delete resto[this.level];
    this.plugin.settings.effortConfigs = resto;
    await this.plugin.saveSettings();
    new Notice(tr("{level} effort is back to its defaults.", { level: nome }));
    for (const l of this.linhas) l.repor();
    this.mostrarDependentes(DEFAULT_EFFORT_CONFIGS[this.level]);
    this.pintarRestaurar();
  }

  private topo(pai: HTMLElement, campo: CampoDeEsforco, padraoVisivel: string) {
    const topo = pai.createDiv({ cls: "corvus-esf-topo" });
    setIcon(topo.createSpan({ cls: "corvus-esf-ico" }), campo.icone);
    const nome = tr(campo.name);
    topo.createSpan({ cls: "corvus-esf-nome", text: nome });
    const info = topo.createEl("button", {
      cls: "corvus-esf-info clickable-icon",
      attr: {
        type: "button",
        "aria-label": tr("What is {name}?", { name: nome }),
        "aria-expanded": "false",
        "aria-controls": `corvus-esf-dica-${campo.key}`,
      },
    });
    setIcon(info, "info");
    info.addEventListener("click", () => this.alternarDica(info, topo, campo));
    const volta = topo.createEl("button", {
      cls: "corvus-esf-volta clickable-icon",
      attr: {
        type: "button",
        "aria-label": tr("Back to the {level} default ({value})", {
          level: tr(EFFORT_LABELS[this.level]),
          value: padraoVisivel,
        }),
      },
    });
    setIcon(volta, "rotate-ccw");
    const valorEl = topo.createSpan({ cls: "corvus-esf-valor" });
    return { topo, valorEl, volta };
  }

  private linhaDeNumero(pai: HTMLElement, campo: CampoDeEsforco): LinhaViva {
    const padrao = DEFAULT_EFFORT_CONFIGS[this.level][campo.key] as number;
    const mostrar = campo.mostrar ?? String;
    const salvo = () => this.editado()[campo.key] as number | undefined;
    const linha = pai.createDiv({ cls: "corvus-esf-linha" });
    const { valorEl, volta } = this.topo(linha, campo, mostrar(padrao));

    const paradas = paradasCom(campo, salvo() ?? padrao);
    const slider = linha.createEl("input", {

      cls: "slider corvus-slider corvus-esf-slider",
      attr: {
        type: "range",
        min: "0",
        max: String(paradas.length - 1),
        step: "1",
        "aria-label": tr(campo.name),
        "aria-description": tr(campo.desc),
      },
    });

    const pintar = (v: number) => {
      const i = Math.max(0, paradas.indexOf(v));
      slider.value = String(i);
      slider.setCssProps({ "--slider-fill-ratio": String(i / (paradas.length - 1)) });
      slider.setAttribute("aria-valuetext", mostrar(v));
      valorEl.setText(mostrar(v));
      linha.toggleClass("is-custom", v !== padrao);
    };
    const daTrilha = () => paradas[Number(slider.value)] ?? padrao;

    const dependentes = (v: number) => {
      if (campo.key !== "maxTokens") return;
      const cfg = resolveEffortConfig(this.level, this.plugin.settings.effortConfigs);
      this.mostrarDependentes({ ...cfg, maxTokens: v });
    };

    slider.addEventListener("input", () => {
      const v = daTrilha();
      pintar(v);
      dependentes(v);
    });
    slider.addEventListener("change", () => {
      const v = daTrilha();
      pintar(v);
      dependentes(v);
      void this.gravar(campo.key, v);
    });
    volta.addEventListener("click", () => {
      pintar(padrao);
      dependentes(padrao);
      void this.gravar(campo.key, undefined);
    });

    const repor = () => pintar(salvo() ?? padrao);
    repor();
    return { campo, el: linha, repor };
  }

  private linhaDeChave(pai: HTMLElement, campo: CampoDeEsforco): LinhaViva {
    const padrao = DEFAULT_EFFORT_CONFIGS[this.level][campo.key] as boolean;
    const salvo = () => this.editado()[campo.key] as boolean | undefined;
    const linha = pai.createDiv({ cls: "corvus-esf-linha is-chave" });
    const { topo, valorEl, volta } = this.topo(linha, campo, padrao ? tr("on") : tr("off"));
    valorEl.remove(); 
    const chave = new ToggleComponent(topo);
    chave.toggleEl.setAttribute("aria-label", tr(campo.name));

    let calado = false;
    const pintar = (v: boolean) => {
      calado = true;
      chave.setValue(v);
      calado = false;
      linha.toggleClass("is-custom", v !== padrao);
    };
    chave.onChange((v) => {
      if (calado) return;
      linha.toggleClass("is-custom", v !== padrao);
      void this.gravar(campo.key, v);
    });
    volta.addEventListener("click", () => {
      pintar(padrao);
      void this.gravar(campo.key, undefined);
    });

    const repor = () => pintar(salvo() ?? padrao);
    repor();
    return { campo, el: linha, repor };
  }
}

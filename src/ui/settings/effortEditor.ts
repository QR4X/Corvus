// src/ui/settings/effortEditor.ts
// O que cada NÍVEL de esforço faz — editável de novo.
//
// O motor sempre leu `effortConfigs` (chat, agente e Vault Q&A), e a casca
// antiga tinha uma aba pra editar (v0.1.73). A aba sumiu no redesign da 0.4.0
// e os ajustes ficaram só no data.json. Volta aqui como um editor por nível,
// aberto da aba Chat. Os rótulos e limites vêm da casca antiga
// (`git show 0.3.0:src/components/settings/CorvusSettingsTab.ts`).
//
// A tela é a mais BAIXA possível (pedido do Rafael): um slider por ajuste,
// nome e valor numa linha só em cima dele, e nenhum texto de explicação na
// tela — ele mora no `title` da linha. Os valores especiais ("sem teto",
// "padrão do provider", "desligado") são paradas do próprio slider, então o
// slider sozinho diz o que antes precisava de uma frase.

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
import { localeDaInterface, marca, tr } from "../../i18n/tr";

type Overrides = Partial<Record<EffortLevel, Partial<EffortConfig>>>;

/** Um campo do editor. O nome e a explicação são só MARCADOS (marca): quem
 *  desenha chama tr(), porque o idioma pode mudar com o app aberto. */
export interface CampoDeEsforco {
  key: keyof EffortConfig;
  /** O nome na linha — curto: a tela não tem lugar pra explicação. */
  name: string;
  /** A explicação: o que o ⓘ da linha abre (e o que o leitor de tela lê). */
  desc: string;
  /** O desenho na frente do nome — acha-se a linha de relance, sem ler. */
  icone: string;
  tipo: "numero" | "chave";
  min?: number;
  max?: number;
  /** As paradas do slider, NA ORDEM da trilha. O "sem teto" (0) mora na
   *  ponta direita, depois do maior número — é o maior de todos. */
  paradas?: number[];
  /** Como o valor aparece na linha ("2k tokens", "No cap"). */
  mostrar?: (v: number) => string;
  /** A linha só aparece quando isto vale: a parte do contexto só conta com
   *  a resposta sem teto. */
  quando?: (cfg: EffortConfig) => boolean;
}

/** `ini`, `ini + passo`, … até `fim` — sem o lixo de ponto flutuante. */
function de(ini: number, fim: number, passo = 1): number[] {
  const out: number[] = [];
  for (let i = 0; ini + i * passo <= fim + 1e-9; i++) {
    out.push(Math.round((ini + i * passo) * 10) / 10);
  }
  return out;
}

/** Os oito ajustes, em três blocos: a resposta (tamanho, a parte do contexto
 *  quando não tem teto, temperatura), o agente (novas tentativas,
 *  trava de loop, paralelo) e o Vault Q&A (quantas notas, quanto de cada). */
export const CAMPOS_DE_ESFORCO: CampoDeEsforco[] = [
  {
    key: "maxTokens",
    icone: "message-square-text",
    name: marca("Reply length"),
    desc: marca(
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
    name: marca("Share of context"),
    desc: marca(
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
    name: marca("Temperature"),
    desc: marca(
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
    name: marca("Tool retries"),
    desc: marca(
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
    name: marca("Loop guard"),
    desc: marca(
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
    name: marca("Run tools in parallel"),
    desc: marca(
      "When the Agent asks for several tools at once, run them together instead of one after another. Faster; off is easier to follow."
    ),
    tipo: "chave",
  },
  {
    key: "vaultTopK",
    icone: "files",
    name: marca("Vault Q&A notes"),
    desc: marca(
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
    name: marca("Characters per note"),
    desc: marca(
      "How much of each note Vault Q&A pulls in goes into the context, in characters. More text, more detail, more tokens."
    ),
    tipo: "numero",
    min: 100,
    max: 10000,
    paradas: [
      100, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000,
      8000, 10000,
    ],
    mostrar: (v) => tr("{n} chars", { n: v.toLocaleString(localeDaInterface()) }),
  },
];

/** Prende o número no intervalo do campo. */
export function limitar(valor: number, campo: CampoDeEsforco): number {
  const min = campo.min ?? -Infinity;
  const max = campo.max ?? Infinity;
  return Math.max(min, Math.min(max, valor));
}

/** Onde um valor fica na trilha: o "sem teto" (0, nos campos que o têm na
 *  ponta) é o maior de todos. */
function posicao(campo: CampoDeEsforco, v: number): number {
  return v === 0 && campo.paradas?.[campo.paradas.length - 1] === 0 ? Infinity : v;
}

/**
 * As paradas do slider de um campo, com o valor de agora incluído quando ele
 * não é uma delas: um número digitado no editor antigo (900 tokens, digamos)
 * continua exato — o slider ganha uma parada pra ele no lugar certo.
 */
export function paradasCom(campo: CampoDeEsforco, valor: number): number[] {
  const base = campo.paradas ?? [];
  if (base.includes(valor)) return base;
  const alvo = posicao(campo, valor);
  const i = base.findIndex((p) => posicao(campo, p) > alvo);
  return i < 0 ? [...base, valor] : [...base.slice(0, i), valor, ...base.slice(i)];
}

/**
 * O override de um nível depois de mudar UM campo. `undefined` ou o valor de
 * fábrica APAGAM a chave — o data.json guarda só o que difere do padrão, e um
 * nível sem nada editado some de `effortConfigs`.
 */
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

/** Algum campo do nível foi mudado? */
export function nivelEditado(overrides: Overrides | undefined, level: EffortLevel): boolean {
  return CAMPOS_DE_ESFORCO.some((campo) => overrides?.[level]?.[campo.key] !== undefined);
}

/** A linha do nível nas settings: os números que valem agora. */
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

/** O que o editor precisa do plugin — o teste consegue fingir. */
export interface Gravador {
  settings: { effortConfigs: Overrides };
  saveSettings(): Promise<void>;
}

/** Uma linha desenhada, pra quem precisa repintá-la (a dependência do teto,
 *  o "restaurar tudo"). */
interface LinhaViva {
  campo: CampoDeEsforco;
  el: HTMLElement;
  /** Põe a linha no valor de agora (o salvo, ou o de fábrica). */
  repor(): void;
}

/** O editor de UM nível. Valor em cinza = o de fábrica do nível; mexeu, ele
 *  ganha a cor do texto e um ↺ que devolve o de fábrica. */
export class EffortLevelModal extends Modal {
  private linhas: LinhaViva[] = [];
  /** O "Restore" do cabeçalho, ao lado do X: devolve ESTE nível aos padrões
   *  dele — cada nível tem os seus, e os outros ficam como estão. */
  private restaurarEl: HTMLButtonElement | null = null;
  /** O balão de explicação aberto (um por vez) e o ⓘ que o abriu. */
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
    // Qualquer toque fora do ⓘ fecha o balão — inclusive no próprio balão e
    // no botão de um slider (o arraste segue normalmente).
    this.modalEl.addEventListener(
      "pointerdown",
      (e) => {
        if (this.dica && !this.dica.botao.contains(e.target as Node)) this.fecharDica();
      },
      true
    );
  }

  /** O ⓘ: abre a explicação do ajuste logo abaixo da linha, por cima do
   *  que vem depois (não empurra nada — a tela continua do mesmo tamanho).
   *  Tocar de novo no mesmo ⓘ fecha. Perto do fim da lista ele abre pra
   *  cima, em vez de ser cortado pela borda do modal. */
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

  /** Mostra só as linhas que valem com estes números (ver `quando`). */
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

  /**
   * O "Restore": palavra e ícone no cabeçalho, encostado no X — não ocupa
   * altura nenhuma. O X é do Obsidian e muda de lugar e tamanho por
   * plataforma (44px a 12px da borda no Android, outro inset no iPhone, outro
   * no computador), então o Restore é MEDIDO contra ele em vez de copiar
   * números. E o título passa a parar antes dele: centrado, um "Extra high
   * effort" encostava no Restore até num celular de 412px.
   */
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
      // Sem o X onde ele sempre esteve: o Restore entra no fluxo do cabeçalho
      // em vez de flutuar num lugar chutado.
      this.titleEl.parentElement?.appendChild(restaurar);
      restaurar.addClass("is-solto");
      return;
    }
    const rtl = this.modalEl.win.getComputedStyle(this.modalEl).direction === "rtl";
    // Distância da borda do fim do modal até o começo do X.
    const antesDoX = rtl ? x.offsetLeft + x.offsetWidth : this.modalEl.clientWidth - x.offsetLeft;
    restaurar.setCssStyles({
      top: `${x.offsetTop}px`,
      height: `${x.offsetHeight}px`,
      insetInlineEnd: `${antesDoX + 4}px`,
    });
    // O título para antes do Restore: o fim do cabeçalho fica reservado pros
    // dois botões.
    this.titleEl.parentElement?.setCssStyles({
      paddingInlineEnd: `${antesDoX + 4 + restaurar.offsetWidth + 8}px`,
    });
  }

  /** Sem nada editado, o Restore fica apagado — no lugar, sem sumir. */
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

  /** O cabeçalho comum: nome, o ↺ (escondido sem edição) e o valor. O ↺ vem
   *  ANTES do valor: escondido, o lugar dele fica entre os dois, e o valor
   *  continua encostado na ponta direita, alinhado com o fim do slider. */
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

    // As paradas valem pela vida da tela: um valor antigo fora delas ganha a
    // sua (ver paradasCom) e continua alcançável depois de mexer.
    const paradas = paradasCom(campo, salvo() ?? padrao);
    const slider = linha.createEl("input", {
      // `corvus-slider`: só anda pelo botão (ver o CSS) — todo slider do plugin.
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

    /** Pinta o valor `v` (sem gravar): número, cor, ↺, preenchimento. */
    const pintar = (v: number) => {
      const i = Math.max(0, paradas.indexOf(v));
      slider.value = String(i);
      slider.setCssProps({ "--slider-fill-ratio": String(i / (paradas.length - 1)) });
      slider.setAttribute("aria-valuetext", mostrar(v));
      valorEl.setText(mostrar(v));
      linha.toggleClass("is-custom", v !== padrao);
    };
    const daTrilha = () => paradas[Number(slider.value)] ?? padrao;
    /** O teto da resposta decide se a linha da parte do contexto existe. */
    const dependentes = (v: number) => {
      if (campo.key !== "maxTokens") return;
      const cfg = resolveEffortConfig(this.level, this.plugin.settings.effortConfigs);
      this.mostrarDependentes({ ...cfg, maxTokens: v });
    };

    // Arrastando: só a tela acompanha. Soltou: grava — uma escrita por
    // gesto, não uma por parada atravessada.
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
    valorEl.remove(); // o próprio interruptor é o valor
    const chave = new ToggleComponent(topo);
    chave.toggleEl.setAttribute("aria-label", tr(campo.name));

    // O setValue do ToggleComponent CHAMA o onChange quando o valor muda —
    // sem esta trava, abrir a tela (ou o ↺) gravaria sozinho.
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

import { Modal, Notice, setIcon, ToggleComponent, type App } from "obsidian";
import {
  DEFAULT_EFFORT_CONFIGS,
  EFFORT_LABELS,
  effortNumbers,
  resolveEffortConfig,
  shortTokenCount,
  type EffortConfig,
  type EffortLevel,
} from "../../core/effort";
import { ConfirmModal } from "../modals";
import { uiLocale, mark, tr } from "../../i18n/tr";

type Overrides = Partial<Record<EffortLevel, Partial<EffortConfig>>>;

interface EffortField {
  key: keyof EffortConfig;

  name: string;

  desc: string;

  icon: string;
  kind: "number" | "toggle";
  min?: number;
  max?: number;

  stops?: number[];

  format?: (v: number) => string;

  when?: (cfg: EffortConfig) => boolean;
}

function range(start: number, end: number, step = 1): number[] {
  const out: number[] = [];
  for (let i = 0; start + i * step <= end + 1e-9; i++) {
    out.push(Math.round((start + i * step) * 10) / 10);
  }
  return out;
}

export const EFFORT_FIELDS: EffortField[] = [
  {
    key: "maxTokens",
    icon: "message-square-text",
    name: mark("Reply length"),
    desc: mark(
      "The longest a reply can get, in tokens — longer costs more. No cap lets it use up to the share of context below. Models that think first (GPT-5, the o-series, Claude 5, Fable, Gemini 2.5 and 3, DeepSeek V4) spend part of it thinking, so the plugin requests at least 16k (32k on High, 64k from Extra high) where the model ceiling permits. Where the provider allows, the level also sets how hard they think. Existing model ceilings still apply (8k for DeepSeek), even with No cap."
    ),
    kind: "number",
    min: 0,
    max: 200000,
    stops: [
      256, 512, 1000, 1500, 2048, 3000, 4000, 6000, 8000, 12000, 16000, 24000, 32000,
      48000, 64000, 100000, 128000, 200000, 0,
    ],
    format: (v) => (v === 0 ? tr("No cap") : tr("{n} tokens", { n: shortTokenCount(v) })),
  },
  {
    key: "contextReservePercent",
    icon: "pie-chart",
    name: mark("Share of context"),
    desc: mark(
      "With no cap on the reply, how much of the model's context window it may fill. The rest is kept for your message, the chat so far and the notes. The model's own output ceiling still applies on top."
    ),
    kind: "number",
    min: 10,
    max: 95,
    stops: range(10, 95, 5),
    format: (v) => tr("up to {n}%", { n: v }),
    when: (cfg) => cfg.maxTokens === 0,
  },
  {
    key: "temperature",
    icon: "thermometer",
    name: mark("Temperature"),
    desc: mark(
      "How adventurous the wording is: low sticks to the likeliest answer, high is more creative and less predictable. Provider default sends nothing. Not every model takes it — the newest Claude (Fable, Opus 4.7+, Sonnet 5+) and the reasoning models (GPT-5, the o-series, DeepSeek R1) always use their own, so the plugin leaves it out for them. Claude goes up to 1 and NVIDIA from 0.01 to 1 — values outside are brought in."
    ),
    kind: "number",
    min: -1,
    max: 2,
    stops: [-1, ...range(0, 2, 0.1)],
    format: (v) => (v < 0 ? tr("Provider default") : String(v)),
  },
  {
    key: "toolRetryOnError",
    icon: "wrench",
    name: mark("Tool retries"),
    desc: mark(
      "How many times the Agent retries a tool that failed for a passing reason: network, timeout, a locked file. A wrong path is never retried."
    ),
    kind: "number",
    min: 0,
    max: 20,
    stops: [...range(0, 10), 12, 15, 20],
    format: (v) =>
      v === 0 ? tr("None") : v === 1 ? tr("1 retry") : tr("{n} retries", { n: v }),
  },
  {
    key: "loopDetectionWindow",
    icon: "shield",
    name: mark("Loop guard"),
    desc: mark(
      "How many identical tool calls in a row make the Agent stop and rethink, so it doesn't spin in place. Off turns the check off."
    ),
    kind: "number",
    min: 0,
    max: 20,
    stops: range(0, 20),
    format: (v) =>
      v === 0 ? tr("Off") : v === 1 ? tr("1 in a row") : tr("{n} in a row", { n: v }),
  },
  {
    key: "parallelToolCalls",
    icon: "split",
    name: mark("Run tools in parallel"),
    desc: mark(
      "When the Agent asks for several tools at once, run them together instead of one after another. Faster; off is easier to follow."
    ),
    kind: "toggle",
  },
  {
    key: "vaultTopK",
    icon: "files",
    name: mark("Vault Q&A notes"),
    desc: mark(
      "How many of your notes Vault Q&A pulls in to answer each question. More notes, wider view, more tokens. On a local Ollama model the plugin grows the context window to fit what's sent (8k, 16k, 32k…, up to what the model supports), so nothing gets cut — a bigger window just uses more memory."
    ),
    kind: "number",
    min: 1,
    max: 100,
    stops: [...range(1, 20), 25, 30, 40, 50, 75, 100],
    format: (v) => (v === 1 ? tr("1 note") : tr("{n} notes", { n: v })),
  },
  {
    key: "vaultExcerptChars",
    icon: "type",
    name: mark("Characters per note"),
    desc: mark(
      "How much of each note Vault Q&A pulls in goes into the context, in characters. More text, more detail, more tokens."
    ),
    kind: "number",
    min: 100,
    max: 10000,
    stops: [
      100, 200, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000,
      8000, 10000,
    ],
    format: (v) => tr("{n} chars", { n: v.toLocaleString(uiLocale()) }),
  },
];

function stopRank(field: EffortField, v: number): number {
  return v === 0 && field.stops?.[field.stops.length - 1] === 0 ? Infinity : v;
}

export function stopsWith(field: EffortField, value: number): number[] {
  const base = field.stops ?? [];
  if (base.includes(value)) return base;
  const target = stopRank(field, value);
  const i = base.findIndex((p) => stopRank(field, p) > target);
  return i < 0 ? [...base, value] : [...base.slice(0, i), value, ...base.slice(i)];
}

export function withField(
  overrides: Overrides,
  level: EffortLevel,
  key: keyof EffortConfig,
  value: number | boolean | undefined
): Overrides {
  const current: Partial<EffortConfig> = {};
  for (const field of EFFORT_FIELDS) {
    const v = overrides[level]?.[field.key];
    if (v !== undefined) Object.assign(current, { [field.key]: v });
  }
  if (value === undefined || value === DEFAULT_EFFORT_CONFIGS[level][key]) {
    delete current[key];
  } else {
    (current as Record<string, number | boolean>)[key] = value;
  }
  const out: Overrides = { ...overrides };
  if (Object.keys(current).length === 0) delete out[level];
  else out[level] = current;
  return out;
}

export function isLevelEdited(overrides: Overrides | undefined, level: EffortLevel): boolean {
  return EFFORT_FIELDS.some((field) => overrides?.[level]?.[field.key] !== undefined);
}

export function levelSummary(overrides: Overrides | undefined, level: EffortLevel): string {
  const cfg = resolveEffortConfig(level, overrides);
  const temp =
    cfg.temperature < 0
      ? tr("provider temperature")
      : tr("temperature {t}", { t: cfg.temperature });
  const notes =
    cfg.vaultTopK === 1 ? tr("1 note") : tr("{n} notes", { n: cfg.vaultTopK });
  return `${effortNumbers(cfg)} · ${temp} · ${notes}`;
}

interface SettingsWriter {
  settings: { effortConfigs: Overrides };
  saveSettings(): Promise<void>;
}

interface LiveRow {
  field: EffortField;
  el: HTMLElement;

  reset(): void;
}

export class EffortLevelModal extends Modal {
  private rows: LiveRow[] = [];

  private restoreEl: HTMLButtonElement | null = null;

  private tip: { el: HTMLElement; button: HTMLElement } | null = null;

  constructor(
    app: App,
    private readonly plugin: SettingsWriter,
    private readonly level: EffortLevel,
    private readonly onClosed: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("corvus-effort-modal");
    this.titleEl.setText(tr("{level} effort", { level: tr(EFFORT_LABELS[this.level]) }));
    this.draw();
    this.mountRestore();

    this.modalEl.addEventListener(
      "pointerdown",
      (e) => {
        if (this.tip && !this.tip.button.contains(e.target as Node)) this.closeTip();
      },
      true
    );
  }

  private toggleTip(button: HTMLButtonElement, header: HTMLElement, field: EffortField): void {
    const same = this.tip?.button === button;
    this.closeTip();
    if (same) return;
    const el = header.createDiv({
      cls: "corvus-effort-editor-hint",
      text: tr(field.desc),
      attr: { id: `corvus-effort-editor-hint-${field.key}`, role: "note" },
    });
    button.setAttribute("aria-expanded", "true");
    this.tip = { el, button };
    if (el.getBoundingClientRect().bottom > this.contentEl.getBoundingClientRect().bottom) {
      el.addClass("is-above");
    }
  }

  private closeTip(): void {
    if (!this.tip) return;
    this.tip.el.remove();
    this.tip.button.setAttribute("aria-expanded", "false");
    this.tip = null;
  }

  onClose(): void {
    this.contentEl.empty();
    this.onClosed();
  }

  private edited(): Partial<EffortConfig> {
    return this.plugin.settings.effortConfigs?.[this.level] ?? {};
  }

  private async persist(key: keyof EffortConfig, value: number | boolean | undefined) {
    this.plugin.settings.effortConfigs = withField(
      this.plugin.settings.effortConfigs ?? {},
      this.level,
      key,
      value
    );
    await this.plugin.saveSettings();
    this.paintRestore();
  }

  private showDependents(cfg: EffortConfig): void {
    for (const l of this.rows) {
      if (l.field.when) l.el.toggleClass("is-hidden", !l.field.when(cfg));
    }
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.rows = [];
    const list = contentEl.createDiv({ cls: "corvus-effort-editor" });
    for (const field of EFFORT_FIELDS) {
      this.rows.push(
        field.kind === "toggle" ? this.toggleRow(list, field) : this.numberRow(list, field)
      );
    }
    this.showDependents(resolveEffortConfig(this.level, this.plugin.settings.effortConfigs));
  }

  private mountRestore(): void {
    const restoreBtn = this.modalEl.createEl("button", {
      cls: "corvus-effort-editor-restore clickable-icon",
      attr: {
        type: "button",
        "aria-label": tr("Restore {level}'s defaults", {
          level: tr(EFFORT_LABELS[this.level]),
        }),
      },
    });
    setIcon(restoreBtn.createSpan({ cls: "corvus-effort-editor-restore-icon" }), "rotate-ccw");
    restoreBtn.createSpan({ text: tr("Restore") });
    restoreBtn.addEventListener("click", () => void this.restoreAll());
    this.restoreEl = restoreBtn;
    this.paintRestore();

    const x = Array.from(this.modalEl.children).find(
      (el): el is HTMLElement =>
        el !== restoreBtn &&
        (el.hasClass("modal-close-button") || el.hasClass("modal-header-button"))
    );
    if (!x) {

      this.titleEl.parentElement?.appendChild(restoreBtn);
      restoreBtn.addClass("is-detached");
      return;
    }
    const rtl = this.modalEl.win.getComputedStyle(this.modalEl).direction === "rtl";

    const beforeX = rtl ? x.offsetLeft + x.offsetWidth : this.modalEl.clientWidth - x.offsetLeft;
    restoreBtn.setCssStyles({
      top: `${x.offsetTop}px`,
      height: `${x.offsetHeight}px`,
      insetInlineEnd: `${beforeX + 4}px`,
    });

    this.titleEl.parentElement?.setCssStyles({
      paddingInlineEnd: `${beforeX + 4 + restoreBtn.offsetWidth + 8}px`,
    });
  }

  private paintRestore(): void {
    if (this.restoreEl) {
      this.restoreEl.disabled = !isLevelEdited(this.plugin.settings.effortConfigs, this.level);
    }
  }

  private async restoreAll(): Promise<void> {
    const levelName = tr(EFFORT_LABELS[this.level]);
    const ok = await new ConfirmModal(this.app, {
      title: tr("Restore {level} to its defaults?", { level: levelName }),
      body: tr(
        "Every setting of {level} goes back to {level}'s own defaults. The other levels keep theirs.",
        { level: levelName }
      ),
      confirmLabel: tr("Restore"),
      danger: true,
    }).openAndWait();
    if (!ok) return;
    const rest = { ...(this.plugin.settings.effortConfigs ?? {}) };
    delete rest[this.level];
    this.plugin.settings.effortConfigs = rest;
    await this.plugin.saveSettings();
    new Notice(tr("{level} effort is back to its defaults.", { level: levelName }));
    for (const l of this.rows) l.reset();
    this.showDependents(DEFAULT_EFFORT_CONFIGS[this.level]);
    this.paintRestore();
  }

  private buildHeader(parent: HTMLElement, field: EffortField, defaultLabel: string) {
    const header = parent.createDiv({ cls: "corvus-effort-editor-head" });
    setIcon(header.createSpan({ cls: "corvus-effort-editor-icon" }), field.icon);
    const name = tr(field.name);
    header.createSpan({ cls: "corvus-effort-editor-name", text: name });
    const info = header.createEl("button", {
      cls: "corvus-effort-editor-info clickable-icon",
      attr: {
        type: "button",
        "aria-label": tr("What is {name}?", { name }),
        "aria-expanded": "false",
        "aria-controls": `corvus-effort-editor-hint-${field.key}`,
      },
    });
    setIcon(info, "info");
    info.addEventListener("click", () => this.toggleTip(info, header, field));
    const resetBtn = header.createEl("button", {
      cls: "corvus-effort-editor-reset clickable-icon",
      attr: {
        type: "button",
        "aria-label": tr("Back to the {level} default ({value})", {
          level: tr(EFFORT_LABELS[this.level]),
          value: defaultLabel,
        }),
      },
    });
    setIcon(resetBtn, "rotate-ccw");
    const valueEl = header.createSpan({ cls: "corvus-effort-editor-value" });
    return { header, valueEl, resetBtn };
  }

  private numberRow(parent: HTMLElement, field: EffortField): LiveRow {
    const defaultValue = DEFAULT_EFFORT_CONFIGS[this.level][field.key] as number;
    const format = field.format ?? String;
    const saved = () => this.edited()[field.key] as number | undefined;
    const row = parent.createDiv({ cls: "corvus-effort-editor-row" });
    const { valueEl, resetBtn } = this.buildHeader(row, field, format(defaultValue));

    const stops = stopsWith(field, saved() ?? defaultValue);
    const slider = row.createEl("input", {

      cls: "slider corvus-slider corvus-effort-editor-slider",
      attr: {
        type: "range",
        min: "0",
        max: String(stops.length - 1),
        step: "1",
        "aria-label": tr(field.name),
        "aria-description": tr(field.desc),
      },
    });

    const paint = (v: number) => {
      const i = Math.max(0, stops.indexOf(v));
      slider.value = String(i);
      slider.setCssProps({ "--slider-fill-ratio": String(i / (stops.length - 1)) });
      slider.setAttribute("aria-valuetext", format(v));
      valueEl.setText(format(v));
      row.toggleClass("is-custom", v !== defaultValue);
    };
    const fromTrack = () => stops[Number(slider.value)] ?? defaultValue;

    const updateDependents = (v: number) => {
      if (field.key !== "maxTokens") return;
      const cfg = resolveEffortConfig(this.level, this.plugin.settings.effortConfigs);
      this.showDependents({ ...cfg, maxTokens: v });
    };

    slider.addEventListener("input", () => {
      const v = fromTrack();
      paint(v);
      updateDependents(v);
    });
    slider.addEventListener("change", () => {
      const v = fromTrack();
      paint(v);
      updateDependents(v);
      void this.persist(field.key, v);
    });
    resetBtn.addEventListener("click", () => {
      paint(defaultValue);
      updateDependents(defaultValue);
      void this.persist(field.key, undefined);
    });

    const reset = () => paint(saved() ?? defaultValue);
    reset();
    return { field, el: row, reset };
  }

  private toggleRow(parent: HTMLElement, field: EffortField): LiveRow {
    const defaultValue = DEFAULT_EFFORT_CONFIGS[this.level][field.key] as boolean;
    const saved = () => this.edited()[field.key] as boolean | undefined;
    const row = parent.createDiv({ cls: "corvus-effort-editor-row is-toggle" });
    const { header, valueEl, resetBtn } = this.buildHeader(row, field, defaultValue ? tr("on") : tr("off"));
    valueEl.remove(); 
    const toggle = new ToggleComponent(header);
    toggle.toggleEl.setAttribute("aria-label", tr(field.name));

    let silent = false;
    const paint = (v: boolean) => {
      silent = true;
      toggle.setValue(v);
      silent = false;
      row.toggleClass("is-custom", v !== defaultValue);
    };
    toggle.onChange((v) => {
      if (silent) return;
      row.toggleClass("is-custom", v !== defaultValue);
      void this.persist(field.key, v);
    });
    resetBtn.addEventListener("click", () => {
      paint(defaultValue);
      void this.persist(field.key, undefined);
    });

    const reset = () => paint(saved() ?? defaultValue);
    reset();
    return { field, el: row, reset };
  }
}

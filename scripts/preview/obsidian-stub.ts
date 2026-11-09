declare const PREVIEW_OBSIDIAN_VERSION: string;

export function requireApiVersion(version: string): boolean {
  const a = PREVIEW_OBSIDIAN_VERSION.split(".").map(Number);
  const b = version.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

export function getLinkpath(linktext: string): string {
  return (linktext.split("|")[0] ?? "").split("#")[0]?.trim() ?? "";
}

export const Keymap = {
  isModEvent(evt?: MouseEvent | KeyboardEvent): boolean {
    return !!evt && (evt.metaKey || evt.ctrlKey);
  },
};

export function parseYaml(texto?: string): unknown {
  const out: Record<string, string> = {};
  for (const linha of (texto ?? "").split(/\r?\n/)) {
    const m = linha.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length > 1) {
      v = v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    out[m[1]] = v;
  }
  return out;
}
export class Notice {
  constructor(public message?: string) {
    console.log("[notice]", message);
  }
  setMessage() {}
  hide() {}
}

const FAKE_WORDS =
  ("perfeito chat só que assim a transcrição ela tem que aparecer desse mesmo " +
    "jeito que eu vou falando aqui olha que eu vou tirar o print pra você e " +
    "entendeu como é que funciona").split(" ");

let fakeSeg = -1;
let fakeUltimoTamanho = Infinity;

export async function requestUrl(opts: {
  url?: string;
  body?: ArrayBuffer | string;
}): Promise<unknown> {

  if (opts?.url && /^https?:/.test(opts.url) && !/\/v1\//.test(opts.url)) {
    await new Promise((r) => setTimeout(r, 300));
    return {
      status: 200,
      text: [
        "<html><head><title>Spaced repetition — Wikipedia</title></head>",
        "<body><script>ignora()</script><h1>Spaced repetition</h1>",
        "<p>Spaced repetition is an evidence-based learning technique.</p>",
        "<p>It is usually performed with flashcards &amp; software.</p>",
        "</body></html>",
      ].join(""),
    };
  }

  if (opts?.url && /audio\/transcriptions/.test(opts.url)) {
    const bytes =
      typeof opts.body === "string"
        ? opts.body.length
        : (opts.body?.byteLength ?? 0);
    if (bytes <= fakeUltimoTamanho) fakeSeg += 1;
    fakeUltimoTamanho = bytes;
    const seg = fakeSeg;

    const log = ((window as unknown as Record<string, unknown>).__transcribeLog ??=
      []) as { bytes: number; at: number; seg: number }[];
    log.push({ bytes, at: Date.now(), seg });

    const derrubar = (new URLSearchParams(location.search).get("falhar") ?? "")
      .split(",")
      .filter(Boolean)
      .map(Number);
    if (derrubar.includes(log.length)) {
      await new Promise((r) => setTimeout(r, 200));
      return { status: 500, json: { error: { message: "preview: simulated failure" } } };
    }

    const base = Number(new URLSearchParams(location.search).get("lag") ?? 700);
    const segundosDeAudio = bytes / 4000;
    await new Promise((r) =>
      setTimeout(r, base + bytes / 190 + segundosDeAudio * 120)
    );

    const palavras = Math.max(1, Math.min(6, Math.round(bytes / 6000)));
    const inicio = (seg * 6) % FAKE_WORDS.length;
    return {
      status: 200,
      json: { text: FAKE_WORDS.slice(inicio, inicio + palavras).join(" ") },
    };
  }

  if (opts?.url && /audio\/speech|text-to-speech/.test(opts.url)) {
    await new Promise((r) => setTimeout(r, 300));
    return { status: 200, arrayBuffer: silentWav() };
  }
  if (opts?.url && /elevenlabs\.io\/v1\/voices/.test(opts.url)) {
    await new Promise((r) => setTimeout(r, 300));
    return {
      status: 200,
      json: {
        voices: [
          { voice_id: "v-rachel", name: "Rachel", category: "premade" },
          { voice_id: "v-rafael", name: "Rafael", category: "cloned" },
        ],
      },
    };
  }
  throw new Error("no network in preview");
}

function silentWav(): ArrayBuffer {
  const rate = 8000;
  const frames = rate / 5;
  const buf = new ArrayBuffer(44 + frames * 2);
  const v = new DataView(buf);
  const ascii = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + frames * 2, true);
  ascii(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, frames * 2, true);
  return buf;
}
export class Plugin {}
export class PluginSettingTab {
  containerEl: HTMLElement = document.createElement("div");
  icon = "";
  constructor(public app?: unknown, _plugin?: unknown) {}
  display(): void {}
  hide(): void {}

  refreshDomState(): void {}
}
export class ItemView {}

export class Modal {
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;

  constructor(public app?: unknown) {
    this.containerEl = document.createElement("div");
    this.containerEl.className = "modal-container mod-dim";
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal";
    const fechar = document.createElement("div");
    fechar.className = "modal-close-button";
    fechar.addEventListener("click", () => this.close());
    this.titleEl = document.createElement("div");
    this.titleEl.className = "modal-title";
    this.contentEl = document.createElement("div");
    this.contentEl.className = "modal-content";
    this.modalEl.append(fechar, this.titleEl, this.contentEl);
    this.containerEl.append(bg, this.modalEl);
  }

  onOpen(): void {}
  onClose(): void {}

  open() {
    document.body.appendChild(this.containerEl);
    this.onOpen();
  }

  close() {
    this.onClose();
    this.containerEl.remove();
  }
}
export class FuzzySuggestModal extends Modal {
  setPlaceholder() {}
}

export class SuggestModal<T> extends Modal {
  setPlaceholder(_p?: string) {}
  getSuggestions(_q: string): T[] {
    return [];
  }
}
export class MarkdownView {}

export function getLanguage(): string {
  try {
    return new URLSearchParams(location.search).get("lang") ?? "en";
  } catch {
    return "en";
  }
}

export class ToggleComponent {
  toggleEl: HTMLElement;
  private valor = false;
  private handler: ((v: boolean) => void) | null = null;
  constructor(container: HTMLElement) {
    this.toggleEl = document.createElement("div");
    this.toggleEl.className = "checkbox-container";
    container.appendChild(this.toggleEl);
    this.toggleEl.addEventListener("click", () => {
      this.setValue(!this.valor);
    });
  }
  getValue() {
    return this.valor;
  }
  setValue(v: boolean) {
    const mudou = v !== this.valor;
    this.valor = v;
    this.toggleEl.classList.toggle("is-enabled", v);

    if (mudou) this.handler?.(v);
    return this;
  }
  setDisabled(v: boolean) {
    this.toggleEl.classList.toggle("is-disabled", v);
    return this;
  }
  onChange(fn: (v: boolean) => void) {
    this.handler = fn;
    return this;
  }
}

const V113 = () => requireApiVersion("1.13.0");

function divCls(cls: string): HTMLDivElement {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}

function putText(el: HTMLElement, v: string | DocumentFragment) {
  el.textContent = "";
  if (typeof v === "string") el.textContent = v;
  else el.appendChild(v);
}

type Disableable = { setDisabled(v: boolean): unknown };

export class Setting {
  settingEl: HTMLElement;
  infoEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;
  components: Disableable[] = [];

  constructor(el: HTMLElement) {
    this.settingEl = divCls("setting-item");
    if (V113()) this.settingEl.tabIndex = -1;
    this.infoEl = divCls("setting-item-info");
    this.nameEl = divCls("setting-item-name");
    this.descEl = divCls("setting-item-description");
    this.infoEl.append(this.nameEl, this.descEl);
    this.controlEl = divCls("setting-item-control");
    this.settingEl.append(this.infoEl, this.controlEl);
    el.appendChild(this.settingEl);
  }
  setName(v: string | DocumentFragment) {
    putText(this.nameEl, v);
    return this;
  }
  setDesc(v: string | DocumentFragment) {
    putText(this.descEl, v);
    return this;
  }
  setClass(cls: string) {
    this.settingEl.classList.add(cls);
    return this;
  }
  setHeading() {
    this.settingEl.classList.add("setting-item-heading");
    return this;
  }
  setDisabled(v: boolean) {
    this.settingEl.classList.toggle("is-disabled", v);
    for (const c of this.components) c.setDisabled(v);
    return this;
  }

  clear() {
    this.controlEl.textContent = "";
    this.components = [];
    return this;
  }
  then(cb: (s: this) => void) {
    cb(this);
    return this;
  }
  addText(cb: (t: unknown) => void) {
    const input = document.createElement("input");
    input.type = "text";
    input.spellcheck = false;
    this.controlEl.appendChild(input);
    const api = {
      inputEl: input,
      setPlaceholder(v: string) { input.placeholder = v; return api; },
      setValue(v: string) { input.value = v ?? ""; return api; },
      getValue() { return input.value; },
      setDisabled(v: boolean) { input.disabled = v; return api; },
      onChange(fn: (v: string) => void) {
        input.addEventListener("input", () => fn(input.value));
        return api;
      },
    };
    this.components.push(api);
    cb(api);
    return this;
  }
  addToggle(cb: (t: unknown) => void) {
    const wrap = divCls("checkbox-container");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.tabIndex = 0;
    wrap.appendChild(box);
    this.controlEl.appendChild(wrap);
    let handler: ((v: boolean) => void) | null = null;
    const api = {
      toggleEl: wrap,
      getValue() { return wrap.classList.contains("is-enabled"); },
      setValue(v: boolean) { wrap.classList.toggle("is-enabled", !!v); box.checked = !!v; return api; },
      setDisabled(v: boolean) { wrap.classList.toggle("is-disabled", v); return api; },
      onChange(fn: (v: boolean) => void) { handler = fn; return api; },
    };
    wrap.addEventListener("click", (e) => {
      e.preventDefault();
      api.setValue(!api.getValue());
      handler?.(api.getValue());
    });
    this.components.push(api);
    cb(api);
    this.settingEl.classList.add("mod-toggle");
    return this;
  }
  addDropdown(cb: (d: unknown) => void) {
    const sel = document.createElement("select");
    sel.className = "dropdown";
    this.controlEl.appendChild(sel);
    const api = {
      selectEl: sel,
      addOption(value: string, label: string) {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = label;
        sel.appendChild(o);
        return api;
      },
      addOptions(opts: Record<string, string>) {
        for (const [v, l] of Object.entries(opts)) api.addOption(v, l);
        return api;
      },
      getValue() { return sel.value; },
      setValue(v: string) { sel.value = v; return api; },
      setDisabled(v: boolean) { sel.disabled = v; return api; },
      onChange(fn: (v: string) => void) {
        sel.addEventListener("change", () => fn(sel.value));
        return api;
      },
    };
    this.components.push(api);
    cb(api);
    return this;
  }
  addButton(cb: (b: unknown) => void) {
    const btn = document.createElement("button");
    this.controlEl.appendChild(btn);
    const api = {
      buttonEl: btn,
      setButtonText(v: string) { btn.textContent = v; return api; },
      setCta() { btn.classList.add("mod-cta"); return api; },
      setWarning() { btn.classList.add("mod-warning"); return api; },
      setClass(c: string) { btn.classList.add(c); return api; },
      setDisabled(v: boolean) { btn.disabled = !!v; return api; },
      onClick(fn: () => void) {
        btn.addEventListener("click", fn);
        return api;
      },
    };
    this.components.push(api);
    cb(api);
    return this;
  }
}

export class SettingGroup {
  groupEl: HTMLElement;
  headerEl: HTMLElement;
  headerInnerEl: HTMLElement;
  controlEl: HTMLElement;
  searchContainerEl: HTMLElement | null = null;
  listEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.groupEl = divCls("setting-group");
    containerEl.appendChild(this.groupEl);
    this.headerEl = divCls("setting-item setting-item-heading");
    this.headerInnerEl = divCls("setting-item-name");
    this.controlEl = divCls("setting-item-control");
    this.headerEl.append(this.headerInnerEl, this.controlEl);
    if (V113()) {
      this.searchContainerEl = divCls("setting-group-search");
      this.searchContainerEl.tabIndex = -1;
      this.groupEl.appendChild(this.searchContainerEl);
    }
    this.listEl = divCls("setting-items");
    this.groupEl.appendChild(this.listEl);
  }
  setHeading(text: string) {
    this.headerInnerEl.textContent = text;
    const shown = this.headerEl.parentElement === this.groupEl;
    if (text && !shown) this.groupEl.prepend(this.headerEl);
    else if (!text && shown) this.headerEl.remove();
    return this;
  }

  addClass(...cls: string[]) {
    this.groupEl.classList.add(...cls);
    return this;
  }
  addSetting(cb: (s: Setting) => void) {
    cb(new Setting(this.listEl));
    return this;
  }
}
export class TFile {}
export class TFolder {}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export class Component {
  load() {}
  unload() {}
}

export const MarkdownRenderer = {
  async render(_app: unknown, text: string, el: HTMLElement) {
    const esc = (t: string) =>
      t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inline = (t: string) =>
      esc(t)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")

        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    const out: string[] = [];
    let lista: string[] = [];
    const fechaLista = () => {
      if (lista.length) out.push("<ul>" + lista.join("") + "</ul>");
      lista = [];
    };
    let tabela: string[] = [];
    const celulas = (l: string) =>
      l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const fechaTabela = () => {
      if (tabela.length === 0) return;
      const linhas = tabela.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l));
      const [cab, ...corpo] = linhas;
      const th = celulas(cab ?? "").map((c) => "<th>" + inline(c) + "</th>");
      const tr = corpo.map(
        (l) =>
          "<tr>" +
          celulas(l).map((c) => "<td>" + inline(c) + "</td>").join("") +
          "</tr>"
      );
      out.push(
        "<table><thead><tr>" + th.join("") + "</tr></thead><tbody>" +
          tr.join("") + "</tbody></table>"
      );
      tabela = [];
    };

    let cerca: { mark: string; lang: string; linhas: string[] } | null = null;

    const bloco = (lang: string, linhas: string[]) =>
      '<pre><button class="copy-code-button"><i data-lucide="copy"></i></button><code class="language-' +
      lang +
      '">' +
      esc(linhas.join(String.fromCharCode(10))) +
      "</code></pre>";
    for (const linha of text.split(String.fromCharCode(10))) {
      const abre = linha.match(/^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/);
      if (cerca) {
        if (abre && abre[1][0] === cerca.mark[0] && abre[1].length >= cerca.mark.length) {
          out.push(bloco(cerca.lang, cerca.linhas));
          cerca = null;
        } else {
          cerca.linhas.push(linha);
        }
        continue;
      }
      if (abre) {
        fechaLista();
        cerca = { mark: abre[1], lang: abre[2] || "none", linhas: [] };
        continue;
      }
      const h = linha.match(/^(#{1,4})\s+(.*)$/);
      const li = linha.match(/^[-*]\s+(.*)$/);

      if (/^\s*\|.*\|\s*$/.test(linha)) {
        fechaLista();
        tabela.push(linha);
        continue;
      }
      if (tabela.length > 0) fechaTabela();

      if (/^>\s?/.test(linha)) {
        fechaLista();
        out.push("<blockquote><p>" + inline(linha.replace(/^>\s?/, "")) + "</p></blockquote>");
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(linha.trim())) {
        fechaLista();
        out.push("<hr>");
        continue;
      }
      if (h) {
        fechaLista();
        out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      } else if (li) {
        lista.push(`<li>${inline(li[1])}</li>`);
      } else if (linha.trim() === "") {
        fechaLista();
      } else {
        fechaLista();
        out.push(`<p>${inline(linha)}</p>`);
      }
    }
    fechaLista();
    fechaTabela();
    if (cerca) out.push(bloco(cerca.lang, cerca.linhas));
    el.innerHTML = out.join("");
  },
};

const CUSTOM_ICONS = new Map<string, string>();

export function addIcon(id: string, svgContent: string): void {
  CUSTOM_ICONS.set(id, svgContent);
}

export function setIcon(el: HTMLElement, name: string): void {
  const custom = CUSTOM_ICONS.get(name);
  if (custom) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.innerHTML = custom;
    el.appendChild(svg);
    return;
  }
  const i = document.createElement("i");
  i.setAttribute("data-lucide", name);
  el.appendChild(i);
  (window as unknown as { lucide?: { createIcons: (o: unknown) => void } })
    .lucide?.createIcons({ nameAttr: "data-lucide" });
}

export const Platform = {
  isMobile:
    new URLSearchParams(location.search).get("platform") !== "desktop",
};

export class MenuItem {
  title = "";
  checked = false;
  setTitle(t: string) {
    this.title = t;
    return this;
  }
  setIcon() {
    return this;
  }
  setChecked(v: boolean) {
    this.checked = v;
    return this;
  }
  setDisabled() {
    return this;
  }
  setWarning() {
    return this;
  }
  onClick(cb: () => void) {
    this.cb = cb;
    return this;
  }
  cb: (() => void) | null = null;
}

export class Menu {
  private items: MenuItem[] = [];
  addItem(cb: (item: MenuItem) => void) {
    const it = new MenuItem();
    cb(it);
    this.items.push(it);
    return this;
  }
  showAtPosition(pos: { x: number; y: number }) {
    const host = document.createElement("div");
    host.className = "preview-menu";
    host.style.left = `${Math.min(pos.x, window.innerWidth - 220)}px`;
    host.style.top = `${Math.min(pos.y, window.innerHeight - 200)}px`;
    for (const it of this.items) {
      const b = document.createElement("button");
      b.textContent = (it.checked ? "✓ " : "") + it.title;
      b.onclick = () => {
        it.cb?.();
        host.remove();
      };
      host.appendChild(b);
    }
    document.body.appendChild(host);
    setTimeout(() => {
      const off = () => {
        host.remove();
        document.removeEventListener("click", off);
      };
      document.addEventListener("click", off);
    }, 0);
  }
  showAtMouseEvent(ev: MouseEvent) {
    this.showAtPosition({ x: ev.clientX, y: ev.clientY });
  }
}

import { App, Component, MarkdownRenderer, Modal, Setting } from "obsidian";
import type { ToolCall, ToolDefinition } from "./types";
import type { Translations } from "../i18n";
import { texto } from "../core/text";

interface ConfirmOpts {
  toolCall: ToolCall;
  definition: ToolDefinition;

  showDiff?: boolean;

  strings: Translations["agent"];
}

export interface ConfirmResult {
  approved: boolean;

  approveAll: boolean;
}

export class ConfirmationModal extends Modal {
  private opts: ConfirmOpts;
  private resolver: (r: ConfirmResult) => void = () => {};
  private resolved = false;

  private md: Component | null = null;

  constructor(app: App, opts: ConfirmOpts) {
    super(app);
    this.opts = opts;
  }

  openAndWait(): Promise<ConfirmResult> {
    return new Promise<ConfirmResult>((resolve) => {
      this.resolver = resolve;
      this.open();
    });
  }

  private resolveOnce(approved: boolean, approveAll = false) {
    if (this.resolved) return;
    this.resolved = true;
    this.resolver({ approved, approveAll });
  }

  onOpen() {
    const { contentEl, opts } = this;
    contentEl.empty();
    contentEl.addClass("corvus-confirm-modal");
    this.modalEl.addClass("corvus-modal-keyboard-aware");

    this.containerEl.addClass("corvus-modal-container", "corvus-confirm-container");

    const irreversible = !!opts.definition.irreversible;
    const strings = opts.strings;

    contentEl.createEl("h2", {
      text: irreversible
        ? strings.confirmTitleIrreversible
        : opts.definition.network
          ? strings.confirmTitleWeb
          : strings.confirmTitle,
    });

    const summaryEl = contentEl.createDiv({ cls: "corvus-confirm-summary" });
    summaryEl.createDiv({
      cls: "corvus-confirm-tool-name",
      text: opts.toolCall.name,
    });
    summaryEl.createDiv({
      cls: "corvus-confirm-tool-desc",
      text: firstSentence(opts.definition.description),
    });

    if (this.opts.showDiff !== false) this.renderPreview(contentEl);

    const setting = new Setting(contentEl);
    setting.addButton((btn) => {
      btn.setButtonText(strings.confirmDeny).onClick(() => {
        this.resolveOnce(false);
        this.close();
      });
      btn.buttonEl.classList.add("corvus-confirm-deny");
    });

    if (!irreversible) {
      setting.addButton((btn) => {
        btn.setButtonText(strings.confirmApproveAll).onClick(() => {
          this.resolveOnce(true, true);
          this.close();
        });
        btn.buttonEl.classList.add("corvus-confirm-approveall");
      });
    }
    setting.addButton((btn) => {
      btn
        .setButtonText(irreversible ? strings.confirmDelete : strings.confirmApprove)
        .setCta()
        .onClick(() => {
          this.resolveOnce(true);
          this.close();
        });
      if (irreversible) btn.buttonEl.classList.add("corvus-confirm-irreversible");
    });
  }

  private renderPreview(root: HTMLElement) {
    const { name, arguments: args } = this.opts.toolCall;
    const strings = this.opts.strings;
    const path = typeof args.path === "string" ? args.path : "";
    const box = root.createDiv({ cls: "corvus-confirm-preview" });

    const pathRow = (label: string, value: string, cls = "") => {
      const row = box.createDiv({ cls: "corvus-confirm-path " + cls });
      row.createSpan({ cls: "corvus-confirm-path-label", text: label });
      row.createSpan({ cls: "corvus-confirm-path-val", text: value });
    };

    const block = (
      text: string,
      kind: "add" | "del" | "ctx",
      como: Preview = previewFor(path)
    ) => {
      const cls = "corvus-diff-block corvus-diff-" + kind;
      const cortado =
        text.length > MAX_PREVIEW ? text.slice(0, MAX_PREVIEW) : text;

      if (como.kind === "plain") {
        box.createEl("pre", { cls }).textContent = cortado;
      } else {
        const host = box.createDiv({ cls: cls + " is-rich" });
        const md =
          como.kind === "code"
            ? fence(cortado, como.lang)
            : closeOpenFence(cortado);
        void MarkdownRenderer.render(this.app, md, host, path, this.mdOwner())

          .catch(() => {
            host.empty();
            host.removeClass("is-rich");
            host.textContent = cortado;
          });
      }

      if (cortado.length < text.length) {
        box.createDiv({
          cls: "corvus-diff-more",
          text: strings.confirmTruncated(text.length - cortado.length),
        });
      }
    };

    switch (name) {
      case "vault_edit": {
        pathRow(strings.confirmLabelEdit, path);
        block(texto(args.oldStr), "del");
        block(texto(args.newStr), "add");
        return;
      }
      case "vault_create": {
        pathRow(strings.confirmLabelCreate, path, "corvus-confirm-path-add");
        block(texto(args.content), "add");
        return;
      }
      case "vault_create_folder": {
        pathRow(strings.confirmLabelCreateFolder, path, "corvus-confirm-path-add");
        return;
      }
      case "vault_move": {
        pathRow(strings.confirmLabelFrom, texto(args.from), "corvus-confirm-path-del");
        pathRow(strings.confirmLabelTo, texto(args.to), "corvus-confirm-path-add");
        return;
      }
      case "vault_delete": {
        pathRow(strings.confirmLabelDelete, path, "corvus-confirm-path-del");
        return;
      }

      case "web_search": {
        pathRow(strings.confirmLabelWebSearch, "");
        block(texto(args.query), "ctx", { kind: "plain" });
        return;
      }
      case "web_fetch": {
        pathRow(strings.confirmLabelWebFetch, "");
        block(texto(args.url), "ctx", { kind: "plain" });
        return;
      }
      default: {

        Object.entries(args).forEach(([key, value]) => {
          const texto =
            typeof value === "string" ? value : JSON.stringify(value, null, 2);
          pathRow(key, "");
          block(
            texto,
            "ctx",
            typeof value === "string"
              ? { kind: "plain" }
              : { kind: "code", lang: "json" }
          );
        });
      }
    }
  }

  private mdOwner(): Component {
    if (!this.md) {
      this.md = new Component();
      this.md.load();
    }
    return this.md;
  }

  onClose() {
    this.md?.unload();
    this.md = null;
    this.contentEl.empty();
    this.resolveOnce(false); 
  }
}

function firstSentence(desc: string, max = 140): string {
  const d = desc.trim();
  if (!d) return "";
  const m = d.match(/^(.+?\.)(?:\s|$)/);
  const sentence = m ? m[1] : d;
  return sentence.length > max ? sentence.slice(0, max - 1) + "…" : sentence;
}

const MAX_PREVIEW = 1200;

type Preview =
  | { kind: "markdown" }
  | { kind: "code"; lang: string }
  | { kind: "plain" };

const CODE_LANGS: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  svg: "xml",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  ps1: "powershell",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  sql: "sql",
  lua: "lua",
  dart: "dart",
  diff: "diff",
  patch: "diff",
};

const MARKDOWN_EXT = new Set(["md", "markdown", "mdx"]);

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
}

export function previewFor(path: string): Preview {
  const ext = extOf(path);
  if (ext === "" || MARKDOWN_EXT.has(ext)) return { kind: "markdown" };
  const lang = CODE_LANGS[ext];
  return lang ? { kind: "code", lang } : { kind: "plain" };
}

export function fence(text: string, lang: string): string {
  const maior = Math.max(
    0,
    ...Array.from(text.matchAll(/`+/g), (m) => m[0].length)
  );
  const crases = "`".repeat(Math.max(3, maior + 1));
  return `${crases}${lang}\n${text}\n${crases}`;
}

export function closeOpenFence(md: string): string {
  const cercas = md.match(/^ {0,3}(`{3,}|~{3,})/gm);
  if (!cercas || cercas.length % 2 === 0) return md;
  return `${md}\n${cercas[cercas.length - 1].trim()}`;
}

import {
  App,
  Modal,
  Notice,
  Setting,
  requireApiVersion,
  type ButtonComponent,
} from "obsidian";
import type CorvusPlugin from "../main";
import { tr } from "../i18n/tr";

export function marcarPerigoso(b: ButtonComponent): ButtonComponent {
  if (requireApiVersion("1.13.0")) b.buttonEl.addClass("mod-destructive", "mod-cta");
  else b.buttonEl.addClass("mod-warning");
  return b;
}

export interface PromptOptions {
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  submitLabel?: string;
}

export class PromptModal extends Modal {
  private value: string;
  private resolve: ((v: string | null) => void) | null = null;
  private done = false;

  constructor(app: App, private readonly opts: PromptOptions) {
    super(app);
    this.value = opts.initial ?? "";
  }

  onOpen(): void {

    this.modalEl.addClass("corvus-prompt-modal");
    this.modalEl.addClass("corvus-modal-keyboard-aware");

    this.containerEl.addClass("corvus-modal-container", "corvus-prompt-container");
    this.titleEl.setText(this.opts.title);

    const campo = this.contentEl.createDiv({ cls: "corvus-prompt-field" });
    if (this.opts.label) {
      campo.createEl("label", {
        cls: "corvus-prompt-label",
        text: this.opts.label,
      });
    }
    const input = campo.createEl("input", { cls: "corvus-prompt-input" });
    input.type = "text";
    input.value = this.value;
    if (this.opts.placeholder) input.placeholder = this.opts.placeholder;
    input.addEventListener("input", () => {
      this.value = input.value;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      }
    });

    window.setTimeout(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);

    const acoes = this.contentEl.createDiv({ cls: "corvus-prompt-actions" });
    const cancelar = acoes.createEl("button", {
      cls: "corvus-prompt-btn",
      text: tr("Cancel"),
    });
    cancelar.type = "button";
    cancelar.onclick = () => this.close();
    const ok = acoes.createEl("button", {
      cls: "corvus-prompt-btn is-cta",
      text: this.opts.submitLabel ?? tr("OK"),
    });
    ok.type = "button";
    ok.onclick = () => this.submit();
  }

  private submit(): void {
    const v = this.value.trim();
    if (!v) return;
    this.finish(v);
  }

  private finish(v: string | null): void {
    if (this.done) return;
    this.done = true;
    this.resolve?.(v);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.done) {
      this.done = true;
      this.resolve?.(null);
    }
  }

  openAndWait(): Promise<string | null> {
    return new Promise((res) => {
      this.resolve = res;
      this.open();
    });
  }
}

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;

  danger?: boolean;
}

export class ConfirmModal extends Modal {
  private resolve: ((v: boolean) => void) | null = null;
  private done = false;

  constructor(app: App, private readonly opts: ConfirmOptions) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("corvus-native-confirm-modal");
    this.titleEl.setText(this.opts.title);
    if (this.opts.body) this.contentEl.createEl("p", { text: this.opts.body });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText(tr("Cancel")).onClick(() => this.close()))
      .addButton((b) => {
        b.setButtonText(this.opts.confirmLabel ?? tr("Confirm")).onClick(() =>
          this.finish(true)
        );
        if (this.opts.danger) marcarPerigoso(b);
        else b.setCta();
      });
  }

  private finish(v: boolean): void {
    if (this.done) return;
    this.done = true;
    this.resolve?.(v);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.done) {
      this.done = true;
      this.resolve?.(false);
    }
  }

  openAndWait(): Promise<boolean> {
    return new Promise((res) => {
      this.resolve = res;
      this.open();
    });
  }
}

export function openPluginSettings(plugin: CorvusPlugin): void {
  const app = plugin.app as unknown as {
    setting?: { open?: () => void; openTabById?: (id: string) => void };
  };
  try {
    app.setting?.open?.();
    app.setting?.openTabById?.(plugin.manifest.id);
  } catch (err) {
    console.error("[corvus] failed to open Settings:", err);
    new Notice(tr("Open Settings → Community plugins → Corvus."));
  }
}

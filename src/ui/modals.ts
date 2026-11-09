// src/ui/modals.ts
// Modais NATIVOS do Obsidian usados pela casca CRUD: prompt de texto e
// confirmação. Zero CSS próprio — o Obsidian estiliza. (O picker de nota que
// morava aqui listava o vault inteiro e ninguém mais o abria: saiu na 0.9.16.
// Escolher nota é o rankNotes de ui/notePicker.ts.)

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

/**
 * O botão de uma ação destrutiva, com a MESMA cara que o Obsidian daria.
 *
 * `setWarning()` foi depreciado no 1.13 e, no caminho, mudou de sentido: no
 * 1.12 ele punha só a classe `mod-warning`; no 1.13 virou
 * `setDestructive().setCta()` e deixou de pôr `mod-warning`. E
 * `setDestructive()` não existe abaixo do 1.13 — chamá-lo num 1.12 é TypeError,
 * e o manifest declara minAppVersion 1.11.4.
 *
 * Então nenhuma das duas APIs é chamada: reproduzimos o que CADA versão faz,
 * pelas classes que ela mesma usa. O visual é idêntico ao do setWarning em
 * qualquer versão, e sem o aviso de API depreciada nem o de API nova demais.
 */
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

/** Pede um texto curto (nome, título). Resolve null se cancelar. */
export class PromptModal extends Modal {
  private value: string;
  private resolve: ((v: string | null) => void) | null = null;
  private done = false;

  constructor(app: App, private readonly opts: PromptOptions) {
    super(app);
    this.value = opts.initial ?? "";
  }

  onOpen(): void {
    // Markup NOSSO, não dois `Setting` empilhados: a linha do Setting põe o
    // rótulo à esquerda e o controle à direita, e num celular isso vira um
    // campo de duas polegadas do lado de uma palavra. Aqui é a mesma anatomia
    // das folhas — rótulo em cima, campo largo embaixo, ações no fim.
    //
    // `corvus-modal-keyboard-aware` é a classe que a casca 0.2.37 já lia: com o
    // teclado aberto, o CSS levanta o cartão acima dele com folga, em vez de
    // deixá-lo encostado na primeira fileira de teclas.
    this.modalEl.addClass("corvus-prompt-modal");
    this.modalEl.addClass("corvus-modal-keyboard-aware");
    // Ver a nota em agent/ConfirmationModal.ts: marca o container do Obsidian
    // pra o CSS não precisar de `:has()` pra chegar nele.
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
    // Foco no fim do texto, não selecionando tudo: renomear quase sempre é
    // ajustar o que já está lá, e seleção total transforma a primeira tecla
    // num apagão.
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
  /** Botão de confirmar em vermelho (ação destrutiva). */
  danger?: boolean;
}

/** Confirmação sim/não. Resolve false se fechar sem confirmar. */
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

/** Abre as Settings do plugin. `app.setting` é semi-privado → guardado. */
export function openPluginSettings(plugin: CorvusPlugin): void {
  const app = plugin.app as unknown as {
    setting?: { open?: () => void; openTabById?: (id: string) => void };
  };
  try {
    app.setting?.open?.();
    app.setting?.openTabById?.(plugin.manifest.id);
  } catch (err) {
    console.error("[corvus] abrir Settings falhou:", err);
    new Notice(tr("Open Settings → Community plugins → Corvus."));
  }
}

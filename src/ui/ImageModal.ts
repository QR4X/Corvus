// src/ui/ImageModal.ts
// Abre um anexo de imagem em tamanho real, sobre a conversa. A miniatura na
// bolha mostra "qual foto eu mandei"; o toque nela abre ESTE modal pra ler o
// conteúdo (um print não se lê em miniatura). Modal do próprio Obsidian, então
// fecha com Esc e no clique fora sem código extra.

import { App, Modal } from "obsidian";

export class ImageModal extends Modal {
  private url: string;
  private alt: string;

  constructor(app: App, url: string, alt: string) {
    super(app);
    this.url = url;
    this.alt = alt;
  }

  onOpen() {
    this.contentEl.addClass("axxa-image-modal");
    this.contentEl.createEl("img", {
      cls: "axxa-image-modal-img",
      attr: { src: this.url, alt: this.alt },
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

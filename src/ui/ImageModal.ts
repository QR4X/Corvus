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
    this.contentEl.addClass("corvus-image-modal");
    this.contentEl.createEl("img", {
      cls: "corvus-image-modal-img",
      attr: { src: this.url, alt: this.alt },
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

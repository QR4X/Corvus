import { MarkdownView, TFile, type Editor, type Menu, type MarkdownFileInfo } from "obsidian";
import type CorvusPlugin from "../main";
import { pedirAoPainel } from "./bridge";
import { IdiomaModal, acaoNoTexto, type AcaoNoTexto } from "./inline";
import { mark, tr } from "../i18n/tr";

export const PEDIDO_RESUMO = mark(
  "Summarize this note: the main points first, then anything that needs action or a decision."
);

function ehNota(f: unknown): f is TFile {
  return f instanceof TFile && f.extension === "md";
}

export function registrarComandosDoEditor(plugin: CorvusPlugin): void {
  const app = plugin.app;

  const abrirCom = async (pedido: Parameters<typeof pedirAoPainel>[0]) => {
    await plugin.activateView();
    pedirAoPainel(pedido);
  };
  const perguntarSobre = (f: TFile) => void abrirCom({ tipo: "nota", path: f.path });
  const resumir = (f: TFile) => void abrirCom({ tipo: "nota", path: f.path, enviar: tr(PEDIDO_RESUMO) });
  const mandarTrecho = (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
    const texto = editor.getSelection();
    if (!texto.trim()) return;
    void abrirCom({ tipo: "trecho", path: info.file?.path ?? "Selection", texto });
  };
  const noTexto = (editor: Editor, acao: AcaoNoTexto) => void acaoNoTexto(plugin, editor, acao);
  const traduzir = (editor: Editor) =>
    new IdiomaModal(app, (idioma) => void acaoNoTexto(plugin, editor, "translate", { idioma })).open();
  const temSelecao = (editor: Editor) => editor.somethingSelected() && editor.getSelection().trim().length > 0;

  plugin.addCommand({
    id: "ask-about-note",
    name: tr("Ask about this note"),
    icon: "message-square-text",
    checkCallback: (checking) => {
      const f = app.workspace.getActiveFile();
      if (!ehNota(f)) return false;
      if (!checking) perguntarSobre(f);
      return true;
    },
  });
  plugin.addCommand({
    id: "summarize-note",
    name: tr("Summarize this note"),
    icon: "list",
    checkCallback: (checking) => {
      const f = app.workspace.getActiveFile();
      if (!ehNota(f)) return false;
      if (!checking) resumir(f);
      return true;
    },
  });
  plugin.addCommand({
    id: "send-selection-to-chat",
    name: tr("Send selection to chat"),
    icon: "message-square-quote",
    editorCheckCallback: (checking, editor, info) => {
      if (!temSelecao(editor)) return false;
      if (!checking) mandarTrecho(editor, info);
      return true;
    },
  });
  const noTextoComSelecao = (id: string, name: string, icon: string, acao: AcaoNoTexto) =>
    plugin.addCommand({
      id,
      name,
      icon,
      editorCheckCallback: (checking, editor) => {
        if (!temSelecao(editor)) return false;
        if (!checking) noTexto(editor, acao);
        return true;
      },
    });
  noTextoComSelecao("rewrite-selection", tr("Rewrite selection"), "wand-sparkles", "rewrite");
  noTextoComSelecao("fix-selection", tr("Fix grammar and spelling in selection"), "spell-check", "fix");
  plugin.addCommand({
    id: "translate-selection",
    name: tr("Translate selection…"),
    icon: "languages",
    editorCheckCallback: (checking, editor) => {
      if (!temSelecao(editor)) return false;
      if (!checking) traduzir(editor);
      return true;
    },
  });
  plugin.addCommand({
    id: "continue-writing",
    name: tr("Continue writing"),
    icon: "pen-line",
    editorCallback: (editor) => noTexto(editor, "continue"),
  });

  plugin.registerEvent(
    app.workspace.on("editor-menu", (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
      const item = (title: string, icon: string, acao: () => void) =>
        menu.addItem((i) => i.setTitle(title).setIcon(icon).setSection("corvus").onClick(acao));
      if (temSelecao(editor)) {
        item(tr("Rewrite with Corvus"), "wand-sparkles", () => noTexto(editor, "rewrite"));
        item(tr("Fix grammar with Corvus"), "spell-check", () => noTexto(editor, "fix"));
        item(tr("Translate with Corvus…"), "languages", () => traduzir(editor));
        item(tr("Send selection to Corvus"), "message-square-quote", () => mandarTrecho(editor, info));
      } else {
        item(tr("Continue writing with Corvus"), "pen-line", () => noTexto(editor, "continue"));
        if (ehNota(info.file)) {
          const f = info.file;
          item(tr("Ask Corvus about this note"), "message-square-text", () => perguntarSobre(f));
        }
      }
    })
  );

  plugin.registerEvent(
    app.workspace.on("file-menu", (menu: Menu, file) => {
      if (!ehNota(file)) return;
      const item = (title: string, icon: string, acao: () => void) =>
        menu.addItem((i) => i.setTitle(title).setIcon(icon).setSection("corvus").onClick(acao));
      item(tr("Ask Corvus about this note"), "message-square-text", () => perguntarSobre(file));
      item(tr("Summarize with Corvus"), "list", () => resumir(file));
    })
  );
}

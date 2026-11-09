// src/editor/comandos.ts
// O Corvus a partir da NOTA: comandos na paleta (e, no celular, na barra de
// ferramentas do editor, onde a pessoa pode pôr os que usa) e itens no
// clique direito — do texto selecionado e da nota na lista de arquivos.
//
// Dois tipos de ação, e a diferença é onde a resposta mora:
//   · as que viram CONVERSA (perguntar sobre a nota, resumir, mandar a
//     seleção pro chat) abrem o painel e passam pela ponte (ponte.ts);
//   · as que mudam o TEXTO (reescrever, corrigir, traduzir, continuar)
//     escrevem direto na nota (inline.ts), desfazíveis com Ctrl/Cmd+Z.

import { MarkdownView, TFile, type Editor, type Menu, type MarkdownFileInfo } from "obsidian";
import type CorvusPlugin from "../main";
import { pedirAoPainel } from "./ponte";
import { IdiomaModal, acaoNoTexto, type AcaoNoTexto } from "./inline";
import { marca, tr } from "../i18n/tr";

/** O pedido do "Summarize this note" — curto e útil: o essencial e o que
 *  pede ação. Ele vira a MENSAGEM da pessoa na conversa (e o título dela),
 *  então sai no idioma da interface: em português, uma bolha em inglês no
 *  meio do chat parecia um engano. */
export const PEDIDO_RESUMO = marca(
  "Summarize this note: the main points first, then anything that needs action or a decision."
);

/** É uma nota Markdown de verdade (não um canvas, PDF ou imagem)? */
function ehNota(f: unknown): f is TFile {
  return f instanceof TFile && f.extension === "md";
}

export function registrarComandosDoEditor(plugin: CorvusPlugin): void {
  const app = plugin.app;

  /** Abre o painel e entrega o pedido (a ponte segura até ele montar). */
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

  // ── a paleta ──────────────────────────────────────────────────────────
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

  // ── o clique direito no texto ─────────────────────────────────────────
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

  // ── o clique direito na nota (lista de arquivos, aba, "⋯" da nota) ─────
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

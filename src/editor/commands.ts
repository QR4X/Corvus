import { MarkdownView, TFile, type Editor, type Menu, type MarkdownFileInfo } from "obsidian";
import type CorvusPlugin from "../main";
import { sendToPanel } from "./bridge";
import { LanguageModal, runTextAction, type TextAction } from "./inline";
import { mark, tr } from "../i18n/tr";

export const SUMMARIZE_REQUEST = mark(
  "Summarize this note: the main points first, then anything that needs action or a decision."
);

function isNote(f: unknown): f is TFile {
  return f instanceof TFile && f.extension === "md";
}

export function registerEditorCommands(plugin: CorvusPlugin): void {
  const app = plugin.app;

  const openWith = async (request: Parameters<typeof sendToPanel>[0]) => {
    await plugin.activateView();
    sendToPanel(request);
  };
  const askAbout = (f: TFile) => void openWith({ kind: "note", path: f.path });
  const summarize = (f: TFile) => void openWith({ kind: "note", path: f.path, send: tr(SUMMARIZE_REQUEST) });
  const sendSelection = (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
    const text = editor.getSelection();
    if (!text.trim()) return;
    void openWith({ kind: "selection", path: info.file?.path ?? "Selection", text });
  };
  const runAction = (editor: Editor, action: TextAction) => void runTextAction(plugin, editor, action);
  const translate = (editor: Editor) =>
    new LanguageModal(app, (language) => void runTextAction(plugin, editor, "translate", { language })).open();
  const hasSelection = (editor: Editor) => editor.somethingSelected() && editor.getSelection().trim().length > 0;

  plugin.addCommand({
    id: "ask-about-note",
    name: tr("Ask about this note"),
    icon: "message-square-text",
    checkCallback: (checking) => {
      const f = app.workspace.getActiveFile();
      if (!isNote(f)) return false;
      if (!checking) askAbout(f);
      return true;
    },
  });
  plugin.addCommand({
    id: "summarize-note",
    name: tr("Summarize this note"),
    icon: "list",
    checkCallback: (checking) => {
      const f = app.workspace.getActiveFile();
      if (!isNote(f)) return false;
      if (!checking) summarize(f);
      return true;
    },
  });
  plugin.addCommand({
    id: "send-selection-to-chat",
    name: tr("Send selection to chat"),
    icon: "message-square-quote",
    editorCheckCallback: (checking, editor, info) => {
      if (!hasSelection(editor)) return false;
      if (!checking) sendSelection(editor, info);
      return true;
    },
  });
  const selectionCommand = (id: string, name: string, icon: string, action: TextAction) =>
    plugin.addCommand({
      id,
      name,
      icon,
      editorCheckCallback: (checking, editor) => {
        if (!hasSelection(editor)) return false;
        if (!checking) runAction(editor, action);
        return true;
      },
    });
  selectionCommand("rewrite-selection", tr("Rewrite selection"), "wand-sparkles", "rewrite");
  selectionCommand("fix-selection", tr("Fix grammar and spelling in selection"), "spell-check", "fix");
  plugin.addCommand({
    id: "translate-selection",
    name: tr("Translate selection…"),
    icon: "languages",
    editorCheckCallback: (checking, editor) => {
      if (!hasSelection(editor)) return false;
      if (!checking) translate(editor);
      return true;
    },
  });
  plugin.addCommand({
    id: "continue-writing",
    name: tr("Continue writing"),
    icon: "pen-line",
    editorCallback: (editor) => runAction(editor, "continue"),
  });

  plugin.registerEvent(
    app.workspace.on("editor-menu", (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
      const item = (title: string, icon: string, onClick: () => void) =>
        menu.addItem((i) => i.setTitle(title).setIcon(icon).setSection("corvus").onClick(onClick));
      if (hasSelection(editor)) {
        item(tr("Rewrite with Corvus"), "wand-sparkles", () => runAction(editor, "rewrite"));
        item(tr("Fix grammar with Corvus"), "spell-check", () => runAction(editor, "fix"));
        item(tr("Translate with Corvus…"), "languages", () => translate(editor));
        item(tr("Send selection to Corvus"), "message-square-quote", () => sendSelection(editor, info));
      } else {
        item(tr("Continue writing with Corvus"), "pen-line", () => runAction(editor, "continue"));
        if (isNote(info.file)) {
          const f = info.file;
          item(tr("Ask Corvus about this note"), "message-square-text", () => askAbout(f));
        }
      }
    })
  );

  plugin.registerEvent(
    app.workspace.on("file-menu", (menu: Menu, file) => {
      if (!isNote(file)) return;
      const item = (title: string, icon: string, onClick: () => void) =>
        menu.addItem((i) => i.setTitle(title).setIcon(icon).setSection("corvus").onClick(onClick));
      item(tr("Ask Corvus about this note"), "message-square-text", () => askAbout(file));
      item(tr("Summarize with Corvus"), "list", () => summarize(file));
    })
  );
}

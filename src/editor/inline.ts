import { Notice, SuggestModal, type App, type Editor, type EditorPosition } from "obsidian";
import type CorvusPlugin from "../main";
import { getProvider } from "../providers";
import type { ProviderMessage } from "../providers/base";
import { savedModelFor } from "../core/defaultModel";
import { mark, tr } from "../i18n/tr";
import { providerCredential } from "../core/providersMeta";

export type TextAction = "rewrite" | "fix" | "translate" | "continue";

const CONTINUE_CONTEXT_CHARS = 6000;

const ONLY_THE_TEXT =
  "Reply with ONLY the resulting text: no preface, no explanation, no quotes around it, no code fences.";

export function actionMessages(
  action: TextAction,
  text: string,
  opts: { language?: string } = {}
): ProviderMessage[] {
  const system = (() => {
    switch (action) {
      case "rewrite":
        return `Rewrite the user's text so it reads clearly and well. Keep its meaning, tone and language, and keep the Markdown formatting (links, [[wikilinks]], lists, emphasis, code). ${ONLY_THE_TEXT}`;
      case "fix":
        return `Fix grammar, spelling and punctuation in the user's text, changing as little as possible. Keep its language, meaning, tone and Markdown formatting. ${ONLY_THE_TEXT}`;
      case "translate":
        return `Translate the user's text into ${opts.language ?? "English"}. Keep the Markdown formatting, links, [[wikilinks]] and code exactly as they are. ${ONLY_THE_TEXT}`;
      case "continue":
        return `The user is writing a note and stopped where the text ends. Continue it from exactly that point, in the same language, voice and format, for one or two paragraphs at most. Do not repeat what is already written. ${ONLY_THE_TEXT}`;
    }
  })();
  return [
    { role: "system", content: system },
    { role: "user", content: text },
  ];
}

export function cleanReply(raw: string): string {
  let s = raw.replace(/\r\n/g, "\n").trim();
  const fenced = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(s);
  if (fenced) s = fenced[1].trim();
  const quoted = /^(["“'])([\s\S]*)(["”'])$/.exec(s);
  if (quoted && !quoted[2].includes(quoted[1] === "“" ? "”" : quoted[1])) s = quoted[2].trim();
  return s;
}

export function joinContinuation(before: string, continuation: string): string {
  if (!before || /\s$/.test(before) || /^\s/.test(continuation)) return continuation;
  return ` ${continuation}`;
}

const PROGRESS_LABEL: Record<TextAction, string> = {
  rewrite: mark("Rewriting with {model}…"),
  fix: mark("Fixing with {model}…"),
  translate: mark("Translating with {model}…"),
  continue: mark("Writing with {model}…"),
};

export async function runTextAction(
  plugin: CorvusPlugin,
  editor: Editor,
  action: TextAction,
  opts: { language?: string } = {}
): Promise<void> {
  const s = plugin.settings;
  const providerId = s.defaultProvider || "openai";
  const model = savedModelFor(s, providerId);
  const apiKey = providerCredential(plugin.settings, providerId).trim();
  if (!model) {
    new Notice(tr("Pick a default model in the plugin settings first."));
    return;
  }
  if (!apiKey) {
    new Notice(tr("Add your {provider} key in the plugin settings first.", { provider: providerId }));
    return;
  }

  let from: EditorPosition;
  let to: EditorPosition;
  let original: string;
  let input: string;
  if (action === "continue") {
    from = to = editor.getCursor("to");
    const textBefore = editor.getRange({ line: 0, ch: 0 }, from);
    input = textBefore.slice(-CONTINUE_CONTEXT_CHARS);
    original = "";
    if (!input.trim()) {
      new Notice(tr("Write something first: the model continues from what's there."));
      return;
    }
  } else {
    from = editor.getCursor("from");
    to = editor.getCursor("to");
    original = editor.getRange(from, to);
    input = original;
    if (!original.trim()) {
      new Notice(tr("Select some text first."));
      return;
    }
  }

  const notice = new Notice(tr(PROGRESS_LABEL[action], { model }), 0);
  try {
    const res = await getProvider(providerId).chat(
      { model, messages: actionMessages(action, input, opts) },
      apiKey
    );
    const result = cleanReply(res.content ?? "");
    if (!result) throw new Error(tr("the model returned nothing"));

    if (action === "continue") {

      const textBeforeNow = editor.getRange({ line: 0, ch: 0 }, from);
      if (!textBeforeNow.endsWith(input.slice(-200))) {
        await copyToClipboard(result);
        return;
      }
      editor.replaceRange(joinContinuation(textBeforeNow, result), from);
      return;
    }
    if (editor.getRange(from, to) !== original) {
      await copyToClipboard(result);
      return;
    }
    editor.replaceRange(result, from, to);

    const end = editor.offsetToPos(editor.posToOffset(from) + result.length);
    editor.setSelection(from, end);
  } catch (err) {
    new Notice(tr("Couldn't finish: {error}", { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    notice.hide();
  }
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    new Notice(tr("The text changed while the model was writing, so nothing was replaced. The result is on your clipboard."), 8000);
  } catch {
    new Notice(tr("The text changed while the model was writing, so nothing was replaced."), 8000);
  }
}

const LANGUAGES = [
  mark("English"),
  mark("Portuguese (Brazil)"),
  mark("Spanish"),
  mark("French"),
  mark("German"),
  mark("Italian"),
  mark("Japanese"),
  mark("Chinese (Simplified)"),
  mark("Korean"),
  mark("Russian"),
  mark("Arabic"),
  mark("Hindi"),
  mark("Dutch"),
  mark("Portuguese (Portugal)"),
];

export class LanguageModal extends SuggestModal<string> {
  constructor(
    app: App,
    private readonly onChoose: (language: string) => void
  ) {
    super(app);
    this.modalEl.addClass("corvus-language-modal");
    this.setPlaceholder(tr("Translate into…"));
  }

  getSuggestions(query: string): string[] {
    const q = query.trim().toLowerCase();

    const namesOf = (l: string) => [l.toLowerCase(), tr(l).toLowerCase()];
    const matches = LANGUAGES.filter((l) => namesOf(l).some((n) => n.includes(q)));
    return q && !matches.some((l) => namesOf(l).includes(q)) ? [query.trim(), ...matches] : matches;
  }

  renderSuggestion(language: string, el: HTMLElement): void {

    el.setText(LANGUAGES.includes(language) ? tr(language) : language);
  }

  onChooseSuggestion(language: string): void {
    this.onChoose(language);
  }
}

import { Notice, SuggestModal, type App, type Editor, type EditorPosition } from "obsidian";
import type CorvusPlugin from "../main";
import { getProvider } from "../providers";
import type { ProviderMessage } from "../providers/base";
import { modeloSalvoPara } from "../core/defaultModel";
import { mark, tr } from "../i18n/tr";

export type AcaoNoTexto = "rewrite" | "fix" | "translate" | "continue";

const CONTEXTO_CONTINUAR = 6000;

const SO_O_TEXTO =
  "Reply with ONLY the resulting text: no preface, no explanation, no quotes around it, no code fences.";

export function mensagensDaAcao(
  acao: AcaoNoTexto,
  texto: string,
  opts: { idioma?: string } = {}
): ProviderMessage[] {
  const sistema = (() => {
    switch (acao) {
      case "rewrite":
        return `Rewrite the user's text so it reads clearly and well. Keep its meaning, tone and language, and keep the Markdown formatting (links, [[wikilinks]], lists, emphasis, code). ${SO_O_TEXTO}`;
      case "fix":
        return `Fix grammar, spelling and punctuation in the user's text, changing as little as possible. Keep its language, meaning, tone and Markdown formatting. ${SO_O_TEXTO}`;
      case "translate":
        return `Translate the user's text into ${opts.idioma ?? "English"}. Keep the Markdown formatting, links, [[wikilinks]] and code exactly as they are. ${SO_O_TEXTO}`;
      case "continue":
        return `The user is writing a note and stopped where the text ends. Continue it from exactly that point, in the same language, voice and format, for one or two paragraphs at most. Do not repeat what is already written. ${SO_O_TEXTO}`;
    }
  })();
  return [
    { role: "system", content: sistema },
    { role: "user", content: texto },
  ];
}

export function limparResposta(bruta: string): string {
  let s = bruta.replace(/\r\n/g, "\n").trim();
  const cerca = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(s);
  if (cerca) s = cerca[1].trim();
  const aspas = /^(["“'])([\s\S]*)(["”'])$/.exec(s);
  if (aspas && !aspas[2].includes(aspas[1] === "“" ? "”" : aspas[1])) s = aspas[2].trim();
  return s;
}

export function emendar(antes: string, continuacao: string): string {
  if (!antes || /\s$/.test(antes) || /^\s/.test(continuacao)) return continuacao;
  return ` ${continuacao}`;
}

const ROTULO: Record<AcaoNoTexto, string> = {
  rewrite: mark("Rewriting with {model}…"),
  fix: mark("Fixing with {model}…"),
  translate: mark("Translating with {model}…"),
  continue: mark("Writing with {model}…"),
};

export async function acaoNoTexto(
  plugin: CorvusPlugin,
  editor: Editor,
  acao: AcaoNoTexto,
  opts: { idioma?: string } = {}
): Promise<void> {
  const s = plugin.settings;
  const providerId = s.defaultProvider || "openai";
  const model = modeloSalvoPara(s, providerId);
  const chave = plugin.providerCredential(providerId).trim();
  if (!model) {
    new Notice(tr("Pick a default model in the plugin settings first."));
    return;
  }
  if (!chave) {
    new Notice(tr("Add your {provider} key in the plugin settings first.", { provider: providerId }));
    return;
  }

  let de: EditorPosition;
  let ate: EditorPosition;
  let original: string;
  let entrada: string;
  if (acao === "continue") {
    de = ate = editor.getCursor("to");
    const tudoAntes = editor.getRange({ line: 0, ch: 0 }, de);
    entrada = tudoAntes.slice(-CONTEXTO_CONTINUAR);
    original = "";
    if (!entrada.trim()) {
      new Notice(tr("Write something first: the model continues from what's there."));
      return;
    }
  } else {
    de = editor.getCursor("from");
    ate = editor.getCursor("to");
    original = editor.getRange(de, ate);
    entrada = original;
    if (!original.trim()) {
      new Notice(tr("Select some text first."));
      return;
    }
  }

  const aviso = new Notice(tr(ROTULO[acao], { model }), 0);
  try {
    const res = await getProvider(providerId).chat(
      { model, messages: mensagensDaAcao(acao, entrada, opts) },
      chave
    );
    const resultado = limparResposta(res.content ?? "");
    if (!resultado) throw new Error(tr("the model returned nothing"));

    if (acao === "continue") {

      const antesAgora = editor.getRange({ line: 0, ch: 0 }, de);
      if (!antesAgora.endsWith(entrada.slice(-200))) {
        await copiar(resultado);
        return;
      }
      editor.replaceRange(emendar(antesAgora, resultado), de);
      return;
    }
    if (editor.getRange(de, ate) !== original) {
      await copiar(resultado);
      return;
    }
    editor.replaceRange(resultado, de, ate);

    const fim = editor.offsetToPos(editor.posToOffset(de) + resultado.length);
    editor.setSelection(de, fim);
  } catch (err) {
    new Notice(tr("Couldn't finish: {error}", { error: err instanceof Error ? err.message : String(err) }));
  } finally {
    aviso.hide();
  }
}

async function copiar(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
    new Notice(tr("The text changed while the model was writing, so nothing was replaced. The result is on your clipboard."), 8000);
  } catch {
    new Notice(tr("The text changed while the model was writing, so nothing was replaced."), 8000);
  }
}

export const IDIOMAS = [
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

export class IdiomaModal extends SuggestModal<string> {
  constructor(
    app: App,
    private readonly escolher: (idioma: string) => void
  ) {
    super(app);
    this.modalEl.addClass("corvus-language-modal");
    this.setPlaceholder(tr("Translate into…"));
  }

  getSuggestions(busca: string): string[] {
    const q = busca.trim().toLowerCase();

    const nomes = (l: string) => [l.toLowerCase(), tr(l).toLowerCase()];
    const achados = IDIOMAS.filter((l) => nomes(l).some((n) => n.includes(q)));
    return q && !achados.some((l) => nomes(l).includes(q)) ? [busca.trim(), ...achados] : achados;
  }

  renderSuggestion(idioma: string, el: HTMLElement): void {

    el.setText(IDIOMAS.includes(idioma) ? tr(idioma) : idioma);
  }

  onChooseSuggestion(idioma: string): void {
    this.escolher(idioma);
  }
}

// src/ui/readAloud.ts
// Ler em voz alta. Dois caminhos, escolhidos nas Settings:
//
//   OpenAI      `OpenAIProvider.generateAudio` (/v1/audio/speech) — já existia
//               no motor e nada nesta casca chamava.
//   ElevenLabs  vozes deles E as CLONADAS da conta — é o único caminho pra
//               "minha própria voz", que a OpenAI não expõe por API.
//
// O DETALHE QUE FAZIA O TESTE "NÃO FUNCIONAR": navegador (e WebView) só deixa
// tocar áudio dentro do gesto do usuário. Entre o clique e o play tem uma ida
// à rede — quando ela volta, o gesto já morreu e o `play()` é recusado em
// silêncio. Por isso o elemento é criado e DESTRAVADO com um silêncio ainda
// dentro do clique; quando o mp3 chega, ele só troca de fonte.

import { Notice } from "obsidian";
import type CorvusPlugin from "../main";
import { getProvider } from "../providers";
import { elevenSpeak } from "../providers/elevenlabs";
import { marca, tr } from "../i18n/tr";

/** Teto do texto mandado pro TTS. Resposta longa vira audiobook e custa caro. */
export const SPEAK_MAX_CHARS = 4000;

/** WAV mudo de ~50ms: serve só pra destravar o elemento dentro do gesto. */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

/** Vozes da OpenAI (as que o endpoint aceita hoje). */
export const OPENAI_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
];

/** Modelos de TTS da OpenAI, do mais novo ao mais barato. */
export const OPENAI_TTS_MODELS = ["gpt-4o-mini-tts", "tts-1-hd", "tts-1"];

/** Modelos de transcrição conhecidos. */
export const STT_MODELS = [
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "whisper-1",
];

/** Quem sabe falar hoje. Cresce quando um provider ganhar `generateAudio`. */
export const TTS_PROVIDERS: { id: string; label: string; needs: string }[] = [
  { id: "openai", label: "OpenAI", needs: marca("OpenAI key") },
  { id: "eleven", label: "ElevenLabs", needs: marca("ElevenLabs key") },
];

/** Tem credencial pra falar por este caminho? */
export function ttsReady(plugin: CorvusPlugin, id: string): boolean {
  return id === "eleven"
    ? !!plugin.settings.elevenApiKey?.trim()
    : !!plugin.providerCredential("openai");
}

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
/** Solta quem espera a fala de agora (o `await speak`). Pausar não dispara
 *  `ended` nem `error`: sem isto, a fala parada deixava o `speak` dela
 *  esperando pra sempre — e o botão que esperava junto, preso em "Stop". */
let soltar: (() => void) | null = null;

export function stopSpeaking(): void {
  current?.pause();
  current = null;
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = null;
  const solta = soltar;
  soltar = null;
  solta?.();
}

/** Como falar, além do texto. */
export interface SpeakOptions {
  /** Outra voz que não a das settings: o ▶ de cada voz da lista. */
  voice?: string;
  /** O som começou a sair (a rede já respondeu): o botão troca o "buscando"
   *  pelo "parar". */
  onPlaying?: () => void;
  /** Guarda o áudio: tocar de novo a mesma amostra não gasta outra chamada. */
  guardar?: boolean;
}

/** As amostras já ouvidas (voz, modelo e texto) — poucas, e só enquanto o
 *  app está aberto. Comparar duas vozes é tocar as duas várias vezes. */
const guardadas = new Map<string, { data: Uint8Array; mime: string }>();
const MAX_GUARDADAS = 16;

/** Gera o áudio pelo caminho configurado. */
async function synthesize(
  plugin: CorvusPlugin,
  text: string,
  opts: SpeakOptions
): Promise<{ data: Uint8Array; mime: string } | null> {
  const s = plugin.settings;
  const eleven = s.ttsProvider === "eleven";
  const voz = opts.voice ?? (eleven ? s.elevenVoice : s.ttsVoice);
  const chave = [eleven ? "eleven" : "openai", eleven ? s.elevenModel : s.ttsModel, voz, text].join("\n");
  const pronta = opts.guardar ? guardadas.get(chave) : undefined;
  if (pronta) return pronta;

  let item: { data: Uint8Array; mime: string } | null = null;
  if (eleven) {
    item = await elevenSpeak({
      apiKey: s.elevenApiKey,
      voiceId: voz,
      model: s.elevenModel,
      text,
    });
  } else {
    const provider = getProvider("openai");
    if (!provider.generateAudio) return null;
    const [gerado] = await provider.generateAudio(
      { model: s.ttsModel, prompt: text, voice: voz },
      plugin.providerCredential("openai")
    );
    item = gerado ? { data: gerado.data, mime: gerado.mime } : null;
  }
  if (item && opts.guardar) {
    guardadas.set(chave, item);
    // O Map lembra a ordem de entrada: a primeira chave é a mais antiga.
    const maisVelha = guardadas.keys().next();
    if (guardadas.size > MAX_GUARDADAS && !maisVelha.done) guardadas.delete(maisVelha.value);
  }
  return item;
}

/**
 * Fala o texto. Resolve quando o áudio TERMINA (ou falha) — quem chama usa
 * isso pra desligar o estado "falando" do botão.
 *
 * Chame DIRETO do handler do clique: a primeira linha precisa rodar dentro do
 * gesto pra destravar o áudio.
 */
export async function speak(
  plugin: CorvusPlugin,
  text: string,
  opts: SpeakOptions = {}
): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  const s = plugin.settings;
  if (!ttsReady(plugin, s.ttsProvider)) {
    new Notice(
      s.ttsProvider === "eleven"
        ? tr("Add your ElevenLabs key in Settings › Chat › Voice.")
        : tr("Add your OpenAI key in Settings › Providers.")
    );
    return;
  }

  stopSpeaking();
  // Ainda DENTRO do clique: nasce e toca um silêncio, o que autoriza este
  // elemento a tocar de novo depois que a rede responder.
  const audio = new Audio();
  audio.src = SILENCE;
  void audio.play().catch(() => {});
  current = audio;

  try {
    const item = await synthesize(plugin, clean.slice(0, SPEAK_MAX_CHARS), opts);
    if (!item) {
      new Notice(tr("This provider can't do text-to-speech yet."));
      return;
    }
    // Outra fala começou enquanto esta buscava o áudio: desiste.
    if (current !== audio) return;
    const url = URL.createObjectURL(
      new Blob([item.data as unknown as BlobPart], { type: item.mime })
    );
    currentUrl = url;
    audio.src = url;
    await new Promise<void>((resolve) => {
      soltar = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().then(
        () => {
          if (current === audio) opts.onPlaying?.();
        },
        (err: unknown) => {
          // Parada antes de começar (o ■, ou outra fala) também cai aqui —
          // e não é recusa de ninguém.
          if (current === audio) {
            // Recusa do sistema é diferente de erro de rede — e o usuário
            // precisa saber qual dos dois foi.
            new Notice(
              tr("Playback blocked: {error}", {
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
          resolve();
        }
      );
    });
  } catch (err) {
    new Notice(
      tr("Read aloud failed: {error}", {
        error: err instanceof Error ? err.message : String(err),
      })
    );
  } finally {
    if (current === audio) {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      current = null;
      currentUrl = null;
      soltar = null;
    }
  }
}

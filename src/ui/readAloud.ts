import { Notice } from "obsidian";
import type CorvusPlugin from "../main";
import { getProvider } from "../providers";
import { elevenSpeak } from "../providers/elevenlabs";
import { mark, tr } from "../i18n/tr";
import { providerCredential } from "../core/providersMeta";

const SPEAK_MAX_CHARS = 4000;

const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

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

export const OPENAI_TTS_MODELS = ["gpt-4o-mini-tts", "tts-1-hd", "tts-1"];

export const STT_MODELS = [
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "whisper-1",
];

export const TTS_PROVIDERS: { id: string; label: string; needs: string }[] = [
  { id: "openai", label: "OpenAI", needs: mark("OpenAI key") },
  { id: "eleven", label: "ElevenLabs", needs: mark("ElevenLabs key") },
];

export function ttsReady(plugin: CorvusPlugin, id: string): boolean {
  return id === "eleven"
    ? !!plugin.settings.elevenApiKey?.trim()
    : !!providerCredential(plugin.settings, "openai");
}

let current: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

let release: (() => void) | null = null;

export function stopSpeaking(): void {
  current?.pause();
  current = null;
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = null;
  const pendingRelease = release;
  release = null;
  pendingRelease?.();
}

interface SpeakOptions {

  voice?: string;

  onPlaying?: () => void;

  cache?: boolean;
}

const audioCache = new Map<string, { data: Uint8Array; mime: string }>();
const MAX_CACHED = 16;

async function synthesize(
  plugin: CorvusPlugin,
  text: string,
  opts: SpeakOptions
): Promise<{ data: Uint8Array; mime: string } | null> {
  const s = plugin.settings;
  const eleven = s.ttsProvider === "eleven";
  const voice = opts.voice ?? (eleven ? s.elevenVoice : s.ttsVoice);
  const cacheKey = [eleven ? "eleven" : "openai", eleven ? s.elevenModel : s.ttsModel, voice, text].join("\n");
  const cached = opts.cache ? audioCache.get(cacheKey) : undefined;
  if (cached) return cached;

  let item: { data: Uint8Array; mime: string } | null = null;
  if (eleven) {
    item = await elevenSpeak({
      apiKey: s.elevenApiKey,
      voiceId: voice,
      model: s.elevenModel,
      text,
    });
  } else {
    const provider = getProvider("openai");
    if (!provider.generateAudio) return null;
    const [generated] = await provider.generateAudio(
      { model: s.ttsModel, prompt: text, voice },
      providerCredential(plugin.settings, "openai")
    );
    item = generated ? { data: generated.data, mime: generated.mime } : null;
  }
  if (item && opts.cache) {
    audioCache.set(cacheKey, item);

    const oldest = audioCache.keys().next();
    if (audioCache.size > MAX_CACHED && !oldest.done) audioCache.delete(oldest.value);
  }
  return item;
}

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

    if (current !== audio) return;
    const url = URL.createObjectURL(
      new Blob([item.data as unknown as BlobPart], { type: item.mime })
    );
    currentUrl = url;
    audio.src = url;
    await new Promise<void>((resolve) => {
      release = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().then(
        () => {
          if (current === audio) opts.onPlaying?.();
        },
        (err: unknown) => {

          if (current === audio) {

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
      release = null;
    }
  }
}

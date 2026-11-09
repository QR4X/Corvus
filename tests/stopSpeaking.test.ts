import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { __avisos, __setRequestUrl } from "obsidian";
import { speak, stopSpeaking } from "../src/ui/readAloud";

class AudioDeMentira {
  static todos: AudioDeMentira[] = [];

  static segurar = false;
  static rejeitar: ((e: Error) => void) | null = null;
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pausado = false;
  constructor() {
    AudioDeMentira.todos.push(this);
  }
  play(): Promise<void> {
    this.pausado = false;
    if (AudioDeMentira.segurar && this.src.startsWith("blob:")) {
      return new Promise((_, rejeita) => {
        AudioDeMentira.rejeitar = rejeita;
      });
    }
    return Promise.resolve();
  }
  pause(): void {
    this.pausado = true;
  }
}

const pedidos: { voice?: string; input?: string }[] = [];
const plugin = {
  settings: {
    ttsProvider: "openai",
    ttsModel: "gpt-4o-mini-tts",
    ttsVoice: "alloy",
    elevenApiKey: "",
    elevenVoice: "",
    elevenModel: "",
  },
  providerCredential: () => "sk-teste",
} as unknown as Parameters<typeof speak>[0];

const assentou = (p: Promise<unknown>) =>
  Promise.race([
    p.then(() => "soltou"),
    new Promise((r) => setTimeout(() => r("presa"), 300)),
  ]);

beforeEach(() => {
  AudioDeMentira.todos = [];
  AudioDeMentira.segurar = false;
  AudioDeMentira.rejeitar = null;
  pedidos.length = 0;
  __avisos.length = 0;
  vi.stubGlobal("Audio", AudioDeMentira);
  __setRequestUrl(async (o) => {
    pedidos.push(JSON.parse((o as { body: string }).body));
    return { status: 200, arrayBuffer: new Uint8Array([1, 2, 3]).buffer, json: undefined };
  });
});

afterEach(() => {
  stopSpeaking();
  __setRequestUrl(null);
  vi.unstubAllGlobals();
});

async function falando(texto: string, opts: Parameters<typeof speak>[2] = {}) {
  const tocando = vi.fn();
  const fala = speak(plugin, texto, { ...opts, onPlaying: tocando });
  await vi.waitFor(() => expect(tocando).toHaveBeenCalled());
  return { fala };
}

describe("speak", () => {
  it("parar SOLTA quem espera — o ■ não deixa o botão preso em Stop", async () => {
    const { fala } = await falando("Oi");
    stopSpeaking();
    expect(await assentou(fala)).toBe("soltou");
  });

  it("outra fala começando solta a de antes (o Listen da mensagem anterior volta ao normal)", async () => {
    const { fala: primeira } = await falando("Primeira");
    const segunda = speak(plugin, "Segunda");
    expect(await assentou(primeira)).toBe("soltou");
    expect(AudioDeMentira.todos[0].pausado).toBe(true);
    stopSpeaking();
    await segunda;
  });

  it("a voz da amostra vai pra API — não a das settings", async () => {
    const { fala } = await falando("Oi! Eu sou Coral", { voice: "coral" });
    expect(pedidos).toEqual([
      expect.objectContaining({ voice: "coral", input: "Oi! Eu sou Coral" }),
    ]);
    stopSpeaking();
    await fala;
  });

  it("ElevenLabs: a voz da amostra (o id dela) vai no endereço — não a das settings", async () => {
    const urls: string[] = [];
    __setRequestUrl(async (o) => {
      urls.push((o as { url: string }).url);
      return { status: 200, arrayBuffer: new Uint8Array([1, 2, 3]).buffer, json: undefined };
    });
    const eleven = {
      ...plugin,
      settings: {
        ...plugin.settings,
        ttsProvider: "eleven",
        elevenApiKey: "chave-teste",
        elevenVoice: "voz-das-settings",
        elevenModel: "eleven_multilingual_v2",
      },
    } as unknown as Parameters<typeof speak>[0];
    const tocando = vi.fn();
    const fala = speak(eleven, "Oi! Eu sou Rafael", { voice: "id-do-clone", onPlaying: tocando });
    await vi.waitFor(() => expect(tocando).toHaveBeenCalled());
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/text-to-speech\/id-do-clone$/);
    stopSpeaking();
    await fala;
  });

  it("a mesma amostra de novo não gasta outra chamada; outra voz, sim", async () => {
    const tocarAteOFim = async (voz: string) => {
      const { fala } = await falando("Amostra", { voice: voz, guardar: true });
      AudioDeMentira.todos.at(-1)?.onended?.();
      await fala;
    };
    await tocarAteOFim("sage");
    await tocarAteOFim("sage");
    expect(pedidos).toHaveLength(1);
    await tocarAteOFim("verse");
    expect(pedidos).toHaveLength(2);
  });

  it("guarda poucas: passou de 16, a mais antiga sai e volta a custar uma chamada", async () => {
    const tocarAteOFim = async (voz: string) => {
      const { fala } = await falando("Amostra de despejo", { voice: voz, guardar: true });
      AudioDeMentira.todos.at(-1)?.onended?.();
      await fala;
    };
    for (let i = 0; i <= 16; i++) await tocarAteOFim(`voz-${i}`);
    expect(pedidos).toHaveLength(17);
    await tocarAteOFim("voz-16"); 
    expect(pedidos).toHaveLength(17);
    await tocarAteOFim("voz-0"); 
    expect(pedidos).toHaveLength(18);
  });

  it("sem `guardar` (a leitura do chat), cada fala é uma chamada", async () => {
    for (let i = 0; i < 2; i++) {
      const { fala } = await falando("Resposta");
      AudioDeMentira.todos.at(-1)?.onended?.();
      await fala;
    }
    expect(pedidos).toHaveLength(2);
  });

  it("parada antes de começar a tocar não vira aviso de 'Playback blocked'", async () => {
    AudioDeMentira.segurar = true;
    const fala = speak(plugin, "Oi");
    await vi.waitFor(() => expect(AudioDeMentira.rejeitar).not.toBeNull());
    stopSpeaking();
    AudioDeMentira.rejeitar?.(new Error("The play() request was interrupted by a call to pause()."));
    expect(await assentou(fala)).toBe("soltou");
    expect(__avisos.filter((a) => a.startsWith("Playback blocked"))).toEqual([]);
  });

  it("recusa de verdade (ninguém parou) continua avisando", async () => {
    AudioDeMentira.segurar = true;
    const fala = speak(plugin, "Oi");
    await vi.waitFor(() => expect(AudioDeMentira.rejeitar).not.toBeNull());
    AudioDeMentira.rejeitar?.(new Error("NotAllowedError"));
    await fala;
    expect(__avisos).toContain("Playback blocked: NotAllowedError");
  });
});

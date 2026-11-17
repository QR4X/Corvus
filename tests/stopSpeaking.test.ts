import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { __notices, __setRequestUrl } from "obsidian";
import { speak, stopSpeaking } from "../src/ui/readAloud";

class FakeAudio {
  static all: FakeAudio[] = [];

  static hold = false;
  static reject: ((e: Error) => void) | null = null;
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  constructor() {
    FakeAudio.all.push(this);
  }
  play(): Promise<void> {
    this.paused = false;
    if (FakeAudio.hold && this.src.startsWith("blob:")) {
      return new Promise((_, reject) => {
        FakeAudio.reject = reject;
      });
    }
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

const requests: { voice?: string; input?: string }[] = [];
const plugin = {
  settings: {
    ttsProvider: "openai",
    ttsModel: "gpt-4o-mini-tts",
    ttsVoice: "alloy",
    elevenApiKey: "",
    elevenVoice: "",
    elevenModel: "",
    openaiApiKey: "sk-test",
  },
} as unknown as Parameters<typeof speak>[0];

const settled = (p: Promise<unknown>) =>
  Promise.race([
    p.then(() => "released"),
    new Promise((r) => setTimeout(() => r("stuck"), 300)),
  ]);

beforeEach(() => {
  FakeAudio.all = [];
  FakeAudio.hold = false;
  FakeAudio.reject = null;
  requests.length = 0;
  __notices.length = 0;
  vi.stubGlobal("Audio", FakeAudio);
  __setRequestUrl(async (o) => {
    requests.push(JSON.parse((o as { body: string }).body));
    return { status: 200, arrayBuffer: new Uint8Array([1, 2, 3]).buffer, json: undefined };
  });
});

afterEach(() => {
  stopSpeaking();
  __setRequestUrl(null);
  vi.unstubAllGlobals();
});

async function speaking(text: string, opts: Parameters<typeof speak>[2] = {}) {
  const playing = vi.fn();
  const speech = speak(plugin, text, { ...opts, onPlaying: playing });
  await vi.waitFor(() => expect(playing).toHaveBeenCalled());
  return { speech };
}

describe("speak", () => {
  it("releases the waiting caller on stop so the button does not stay on Stop", async () => {
    const { speech } = await speaking("Hi");
    stopSpeaking();
    expect(await settled(speech)).toBe("released");
  });

  it("releases the previous speech when another one starts", async () => {
    const { speech: first } = await speaking("First");
    const second = speak(plugin, "Second");
    expect(await settled(first)).toBe("released");
    expect(FakeAudio.all[0].paused).toBe(true);
    stopSpeaking();
    await second;
  });

  it("sends the sample voice to the API instead of the settings voice", async () => {
    const { speech } = await speaking("Hi! I am Coral", { voice: "coral" });
    expect(requests).toEqual([
      expect.objectContaining({ voice: "coral", input: "Hi! I am Coral" }),
    ]);
    stopSpeaking();
    await speech;
  });

  it("puts the ElevenLabs sample voice id in the URL instead of the settings voice", async () => {
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
        elevenApiKey: "test-key",
        elevenVoice: "settings-voice",
        elevenModel: "eleven_multilingual_v2",
      },
    } as unknown as Parameters<typeof speak>[0];
    const playing = vi.fn();
    const speech = speak(eleven, "Hi! I am Rafael", { voice: "clone-id", onPlaying: playing });
    await vi.waitFor(() => expect(playing).toHaveBeenCalled());
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/text-to-speech\/clone-id$/);
    stopSpeaking();
    await speech;
  });

  it("reuses a cached sample but calls again for another voice", async () => {
    const playToEnd = async (voice: string) => {
      const { speech } = await speaking("Sample", { voice, cache: true });
      FakeAudio.all.at(-1)?.onended?.();
      await speech;
    };
    await playToEnd("sage");
    await playToEnd("sage");
    expect(requests).toHaveLength(1);
    await playToEnd("verse");
    expect(requests).toHaveLength(2);
  });

  it("evicts the oldest sample past 16 entries so it costs a call again", async () => {
    const playToEnd = async (voice: string) => {
      const { speech } = await speaking("Eviction sample", { voice, cache: true });
      FakeAudio.all.at(-1)?.onended?.();
      await speech;
    };
    for (let i = 0; i <= 16; i++) await playToEnd(`voice-${i}`);
    expect(requests).toHaveLength(17);
    await playToEnd("voice-16");
    expect(requests).toHaveLength(17);
    await playToEnd("voice-0");
    expect(requests).toHaveLength(18);
  });

  it("makes one call per speech without cache, as chat read aloud does", async () => {
    for (let i = 0; i < 2; i++) {
      const { speech } = await speaking("Answer");
      FakeAudio.all.at(-1)?.onended?.();
      await speech;
    }
    expect(requests).toHaveLength(2);
  });

  it("does not show 'Playback blocked' when stopped before playback starts", async () => {
    FakeAudio.hold = true;
    const speech = speak(plugin, "Hi");
    await vi.waitFor(() => expect(FakeAudio.reject).not.toBeNull());
    stopSpeaking();
    FakeAudio.reject?.(new Error("The play() request was interrupted by a call to pause()."));
    expect(await settled(speech)).toBe("released");
    expect(__notices.filter((a) => a.startsWith("Playback blocked"))).toEqual([]);
  });

  it("still shows a notice for a real refusal nobody caused", async () => {
    FakeAudio.hold = true;
    const speech = speak(plugin, "Hi");
    await vi.waitFor(() => expect(FakeAudio.reject).not.toBeNull());
    FakeAudio.reject?.(new Error("NotAllowedError"));
    await speech;
    expect(__notices).toContain("Playback blocked: NotAllowedError");
  });
});

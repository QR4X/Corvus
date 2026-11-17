import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("obsidian", () => import("./obsidian-stub"));

const {
  buildMultipartBody,
  audioMimeFor,
  extractTranscript,
  transcribeAudio,
  getTranscriptionCredential,
  TRANSCRIBE_MAX_BYTES,
} = await import("../src/providers/transcribe");
const { __setRequestUrl } = await import("./obsidian-stub");
const { ProviderError } = await import("../src/providers/base");

const dec = new TextDecoder();
const bytes = (s: string) => new TextEncoder().encode(s);

afterEach(() => __setRequestUrl(null));

describe("buildMultipartBody builds the body requestUrl sends", () => {
  it("a text field gets the right boundary and content disposition", () => {
    const { body, contentType } = buildMultipartBody(
      [{ name: "model", value: "whisper-1" }],
      "BOUND"
    );
    expect(contentType).toBe("multipart/form-data; boundary=BOUND");
    expect(dec.decode(body)).toBe(
      '--BOUND\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--BOUND--\r\n'
    );
  });

  it("a file part carries filename, content type and intact bytes", () => {
    const { body } = buildMultipartBody(
      [
        {
          name: "file",
          filename: "a.webm",
          contentType: "audio/webm",
          data: bytes("binary-ü"),
        },
      ],
      "B"
    );
    const out = dec.decode(body);
    expect(out).toContain('name="file"; filename="a.webm"');
    expect(out).toContain("Content-Type: audio/webm");
    expect(out).toContain("binary-ü");
    expect(out.endsWith("--B--\r\n")).toBe(true);
  });

  it("raw non-UTF-8 bytes pass through uncorrupted", () => {
    const raw = new Uint8Array([0x00, 0xff, 0x1a, 0x45, 0xdf, 0xa3]);
    const { body } = buildMultipartBody(
      [{ name: "file", filename: "a.webm", contentType: "audio/webm", data: raw }],
      "B"
    );
    const view = new Uint8Array(body);

    const idx = view.findIndex(
      (_, i) => raw.every((b, k) => view[i + k] === b)
    );
    expect(idx).toBeGreaterThan(0);
  });

  it("the default boundary is unique per call", () => {
    const a = buildMultipartBody([{ name: "x", value: "1" }]).contentType;
    const b = buildMultipartBody([{ name: "x", value: "1" }]).contentType;
    expect(a).not.toBe(b);
  });
});

describe("audioMimeFor", () => {
  it("maps the extensions the recorder produces", () => {
    expect(audioMimeFor("corvus-ai/recordings/x.webm")).toBe("audio/webm");
    expect(audioMimeFor("x.m4a")).toBe("audio/mp4");
    expect(audioMimeFor("x.ogg")).toBe("audio/ogg");
    expect(audioMimeFor("x.mp3")).toBe("audio/mpeg");
    expect(audioMimeFor("x.wav")).toBe("audio/wav");
  });

  it("an unknown extension falls back to webm, the MediaRecorder default", () => {
    expect(audioMimeFor("no-extension")).toBe("audio/webm");
  });
});

describe("extractTranscript", () => {
  it("reads the text field from JSON", () => {
    expect(extractTranscript({ text: " hello world " })).toBe("hello world");
  });

  it("accepts a plain text response (response_format=text)", () => {
    expect(extractTranscript(undefined, "hello world")).toBe("hello world");
  });

  it("does not mistake raw JSON for a transcript", () => {
    expect(extractTranscript(undefined, '{"error":"x"}')).toBe("");
  });

  it("empty stays empty", () => {
    expect(extractTranscript({ text: "   " }, "")).toBe("");
  });
});

describe("transcribeAudio error contract", () => {
  const base = {
    apiKey: "sk-test",
    model: "gpt-4o-mini-transcribe",
    data: bytes("audio"),
    filename: "a.webm",
  };

  it("a missing key fails with no-key without touching the network", async () => {
    __setRequestUrl(async () => {
      throw new Error("should not be called");
    });
    await expect(transcribeAudio({ ...base, apiKey: "" })).rejects.toMatchObject({
      code: "no-key",
    });
  });

  it("a file above the API limit is rejected before upload", async () => {
    __setRequestUrl(async () => {
      throw new Error("should not be called");
    });
    await expect(
      transcribeAudio({
        ...base,
        data: new Uint8Array(TRANSCRIBE_MAX_BYTES + 1),
      })
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it("401 becomes invalid-key and 429 becomes rate-limit", async () => {
    __setRequestUrl(async () => ({ status: 401, json: {}, text: "" }));
    await expect(transcribeAudio(base)).rejects.toMatchObject({
      code: "invalid-key",
    });
    __setRequestUrl(async () => ({ status: 429, json: {}, text: "" }));
    await expect(transcribeAudio(base)).rejects.toMatchObject({
      code: "rate-limit",
    });
  });

  it("200 returns the transcript and sends the chosen model in the body", async () => {
    let sent: any = null;
    __setRequestUrl(async (opts: any) => {
      sent = opts;
      return { status: 200, json: { text: "good morning" }, text: "" };
    });
    await expect(transcribeAudio(base)).resolves.toBe("good morning");
    expect(sent.contentType).toContain("multipart/form-data; boundary=");
    expect(sent.headers.Authorization).toBe("Bearer sk-test");
    expect(dec.decode(sent.body)).toContain("gpt-4o-mini-transcribe");
  });

  it("the optional language is only sent when given", async () => {
    let sent: any = null;
    __setRequestUrl(async (opts: any) => {
      sent = opts;
      return { status: 200, json: { text: "ok" }, text: "" };
    });
    await transcribeAudio(base);
    expect(dec.decode(sent.body)).not.toContain('name="language"');
    await transcribeAudio({ ...base, language: "pt" });
    expect(dec.decode(sent.body)).toContain('name="language"');
  });

  it("200 with an empty body does not produce a phantom transcript", async () => {
    __setRequestUrl(async () => ({ status: 200, json: {}, text: "" }));
    await expect(transcribeAudio(base)).rejects.toBeInstanceOf(ProviderError);
  });

  it("supports OpenRouter with its endpoint, headers and an openai/ model prefix", async () => {
    let sent: any = null;
    __setRequestUrl(async (opts: any) => {
      sent = opts;
      return { status: 200, json: { text: "transcript via openrouter" }, text: "" };
    });

    const res = await transcribeAudio({
      ...base,
      apiKey: "sk-or-v1-abc123xyz",
      model: "whisper-1",
    });

    expect(res).toBe("transcript via openrouter");
    expect(sent.url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(sent.headers["HTTP-Referer"]).toBe("https://github.com/QR4X/Corvus");
    expect(sent.headers["X-Title"]).toBe("Corvus");
    expect(dec.decode(sent.body)).toContain("openai/whisper-1");
  });

  it("OpenRouter keeps models that already have a slash prefix", async () => {
    let sent: any = null;
    __setRequestUrl(async (opts: any) => {
      sent = opts;
      return { status: 200, json: { text: "ok" }, text: "" };
    });

    await transcribeAudio({
      ...base,
      provider: "openrouter",
      apiKey: "sk-custom-key",
      model: "openai/whisper-large-v3",
    });

    expect(sent.url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(dec.decode(sent.body)).toContain("openai/whisper-large-v3");
  });
});

describe("getTranscriptionCredential", () => {
  it("returns OpenAI when only it is configured", () => {
    const cred = getTranscriptionCredential({ openaiApiKey: "sk-openai" });
    expect(cred).toEqual({ apiKey: "sk-openai", provider: "openai" });
  });

  it("returns OpenRouter when only it is configured", () => {
    const cred = getTranscriptionCredential({ openrouterApiKey: "sk-or-v1-xyz" });
    expect(cred).toEqual({ apiKey: "sk-or-v1-xyz", provider: "openrouter" });
  });

  it("respects defaultProvider when both are configured", () => {
    expect(
      getTranscriptionCredential({
        openaiApiKey: "sk-oai",
        openrouterApiKey: "sk-or",
        defaultProvider: "openrouter",
      })
    ).toEqual({ apiKey: "sk-or", provider: "openrouter" });

    expect(
      getTranscriptionCredential({
        openaiApiKey: "sk-oai",
        openrouterApiKey: "sk-or",
        defaultProvider: "openai",
      })
    ).toEqual({ apiKey: "sk-oai", provider: "openai" });
  });

  it("returns null when no key is configured", () => {
    expect(getTranscriptionCredential({})).toBeNull();
    expect(getTranscriptionCredential({ openaiApiKey: "", openrouterApiKey: "   " })).toBeNull();
  });
});

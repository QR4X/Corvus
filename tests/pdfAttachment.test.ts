import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => import("./obsidian-stub"));

const {
  parseDataUrl,
  pdfFileData,
  hasPdfAttachment,
  toOpenAIMessages,
} = await import("../src/providers/_shared");
const { toAnthropicPayload } = await import("../src/providers/anthropic");
const { applyPdfPlugin } = await import("../src/providers/openrouter");
const { supportsPdf, getModelCapabilities } = await import(
  "../src/providers/modelCapabilities"
);

const B64 = "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2c+Pgo=";
const PDF_URL = `data:application/pdf;base64,${B64}`;

const userWithPdf = (name = "contract.pdf", dataUrl: string | null = PDF_URL) => [
  {
    role: "user" as const,
    content: "summarize this pdf",
    attachments: [{ type: "pdf" as const, name, dataUrl: dataUrl ?? undefined }],
  },
];

describe("parseDataUrl / pdfFileData", () => {
  it("parses the mime type and base64 of a data URL", () => {
    expect(parseDataUrl(PDF_URL)).toEqual({
      mediaType: "application/pdf",
      base64: B64,
    });
  });

  it("rejects external URLs, empty strings and data URLs without base64", () => {
    expect(parseDataUrl("https://x.com/a.pdf")).toBeNull();
    expect(parseDataUrl("")).toBeNull();
    expect(parseDataUrl(undefined)).toBeNull();
    expect(parseDataUrl("data:application/pdf,text")).toBeNull();
  });

  it("pdfFileData normalizes the prefix and accepts raw base64", () => {
    expect(pdfFileData(PDF_URL)).toBe(PDF_URL);
    expect(pdfFileData(B64)).toBe(PDF_URL);
  });

  it("pdfFileData rejects data URLs that are not PDFs", () => {
    expect(pdfFileData("data:image/png;base64,AAAA")).toBeNull();
    expect(pdfFileData("data:text/plain;base64,AAAA")).toBeNull();
  });

  it("pdfFileData relabels octet-stream from the Android WebView instead of dropping it", () => {
    expect(pdfFileData(`data:application/octet-stream;base64,${B64}`)).toBe(PDF_URL);
  });

  it("hasPdfAttachment ignores attachments with an unusable dataUrl", () => {
    expect(hasPdfAttachment(userWithPdf())).toBe(true);
    expect(hasPdfAttachment(userWithPdf("a.pdf", null))).toBe(false);
    expect(
      hasPdfAttachment([{ role: "user", content: "hi" }])
    ).toBe(false);
  });
});

describe("supportsPdf", () => {
  const vision = { vision: true };
  const noVision = { vision: false };

  it("accepts Claude 3.5 and later but not the original Claude 3, 2 or instant", () => {
    expect(supportsPdf("anthropic", "claude-opus-5", noVision)).toBe(true);
    expect(supportsPdf("anthropic", "claude-3-5-sonnet-20241022", noVision)).toBe(true);
    expect(supportsPdf("anthropic", "claude-3-7-sonnet", noVision)).toBe(true);
    expect(supportsPdf("anthropic", "claude-3-opus-20240229", noVision)).toBe(false);
    expect(supportsPdf("anthropic", "claude-3-haiku-20240307", noVision)).toBe(false);
    expect(supportsPdf("anthropic", "claude-2.1", noVision)).toBe(false);
  });

  it("follows vision support for OpenAI", () => {
    expect(supportsPdf("openai", "gpt-4o", vision)).toBe(true);
    expect(supportsPdf("openai", "o1-mini", noVision)).toBe(false);
  });

  it("accepts any OpenRouter chat model because file-parser covers the rest", () => {
    expect(supportsPdf("openrouter", "meta-llama/llama-3.1-8b", noVision)).toBe(true);
  });

  it("rejects providers whose transport cannot carry files", () => {
    expect(supportsPdf("gemini", "gemini-2.5-pro", vision)).toBe(false);
    expect(supportsPdf("nim", "meta/llama-3.1-70b", vision)).toBe(false);
    expect(supportsPdf("ollama", "llama3.2", vision)).toBe(false);
  });

  it("never sends a PDF to an image generation model", () => {
    expect(supportsPdf("openai", "gpt-image-1", { vision: true, imageGen: true })).toBe(false);
  });

  it("is exposed through getModelCapabilities", () => {
    expect(getModelCapabilities("anthropic", "claude-opus-5").pdf).toBe(true);
    expect(getModelCapabilities("gemini", "gemini-2.5-pro").pdf).toBe(false);
  });
});

describe("Anthropic document block", () => {
  it("sends the PDF as a base64 document before the text", () => {
    const { messages } = toAnthropicPayload(userWithPdf());
    const blocks = messages[0].content as Array<Record<string, any>>;
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks[0]).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: B64 },
      title: "contract.pdf",
    });
    expect(blocks[1]).toEqual({ type: "text", text: "summarize this pdf" });
  });

  it("skips an unreadable attachment and still sends the text", () => {
    const { messages } = toAnthropicPayload(userWithPdf("a.pdf", "https://x/a.pdf"));
    expect(messages[0].content).toBe("summarize this pdf");
  });
});

describe("OpenAI-compatible file content part", () => {
  it("sends the PDF as a file part with a data URL after the text", () => {
    const [msg] = toOpenAIMessages(userWithPdf()) as Array<Record<string, any>>;
    expect(msg.content).toEqual([
      { type: "text", text: "summarize this pdf" },
      { type: "file", file: { filename: "contract.pdf", file_data: PDF_URL } },
    ]);
  });

  it("falls back to a plain string without a usable attachment", () => {
    const [msg] = toOpenAIMessages(
      userWithPdf("a.pdf", null)
    ) as Array<Record<string, any>>;
    expect(msg.content).toBe("summarize this pdf");
  });

  it("sends both an image and a PDF in the same message", () => {
    const [msg] = toOpenAIMessages([
      {
        role: "user",
        content: "look",
        attachments: [
          { type: "image", dataUrl: "data:image/png;base64,AAAA" },
          { type: "pdf", name: "a.pdf", dataUrl: PDF_URL },
        ],
      },
    ]) as Array<Record<string, any>>;
    const types = (msg.content as Array<{ type: string }>).map((p) => p.type);
    expect(types).toEqual(["text", "image_url", "file"]);
  });
});

describe("OpenRouter file-parser plugin", () => {
  const req = (model: string) => ({ model, messages: userWithPdf() });

  it("leaves the body alone without a PDF", () => {
    const body = applyPdfPlugin({}, {
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    } as any);
    expect(body.plugins).toBeUndefined();
  });

  it("uses the native engine for vision models", () => {
    const body = applyPdfPlugin({}, req("openai/gpt-4o") as any);
    expect(body.plugins).toEqual([
      { id: "file-parser", pdf: { engine: "native" } },
    ]);
  });

  it("uses the free engine for non-vision models, never the paid default", () => {
    const body = applyPdfPlugin({}, req("meta-llama/llama-3.1-8b-instruct") as any);
    expect(body.plugins).toEqual([
      { id: "file-parser", pdf: { engine: "cloudflare-ai" } },
    ]);
    expect(JSON.stringify(body)).not.toContain("mistral-ocr");
  });
});

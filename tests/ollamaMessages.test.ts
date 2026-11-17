import { describe, it, expect, vi, afterEach } from "vitest";
import { ollamaProvider, toOllamaMessages } from "../src/providers/ollama";
import type { ProviderMessage } from "../src/providers/base";
import { fakeStreamResponse } from "./helpers/streamMock";

const history: ProviderMessage[] = [
  { role: "user", content: "Move my Lisbon trip note into a Personal folder." },
  {
    role: "assistant",
    content: "",
    toolCalls: [{ id: "call_1", name: "vault_list", arguments: { folder: "Personal" } }],
  },
  { role: "tool", toolCallId: "call_1", content: "Folder does not exist: Personal" },
];

describe("toOllamaMessages history format", () => {
  it("sends arguments as an object, not a JSON string", () => {
    const [, assistant] = toOllamaMessages(history) as Array<Record<string, unknown>>;
    const calls = assistant.tool_calls as Array<{ function: { name: string; arguments: unknown } }>;
    expect(calls[0].function).toEqual({ name: "vault_list", arguments: { folder: "Personal" } });
    expect(typeof calls[0].function.arguments).toBe("object");
  });

  it("never sends null assistant content", () => {
    const noText: ProviderMessage[] = [
      { role: "assistant", content: "", toolCalls: [{ id: "c", name: "vault_read", arguments: { path: "a.md" } }] },
    ];
    const [assistant] = toOllamaMessages(noText) as Array<Record<string, unknown>>;
    expect(assistant.content).toBe("");
  });

  it("gives the tool reply the tool_name of its call", () => {
    const [, , toolReply] = toOllamaMessages(history) as Array<Record<string, unknown>>;
    expect(toolReply).toEqual({ role: "tool", content: "Folder does not exist: Personal", tool_name: "vault_list" });
  });

  it("passes plain messages through unchanged", () => {
    const [user] = toOllamaMessages(history) as Array<Record<string, unknown>>;
    expect(user).toEqual({ role: "user", content: "Move my Lisbon trip note into a Personal folder." });
  });
});

describe("toOllamaMessages image attachments", () => {
  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==";

  it("keeps the text as a string and sends the image in `images` as raw base64", () => {
    const [msg] = toOllamaMessages([
      {
        role: "user",
        content: "What color is this?",
        attachments: [{ type: "image", dataUrl: `data:image/png;base64,${PNG}`, mimeType: "image/png" }],
      },
    ]) as Array<Record<string, unknown>>;
    expect(msg).toEqual({ role: "user", content: "What color is this?", images: [PNG] });
  });

  it("puts several images in `images` and never sends content as a list", () => {
    const [msg] = toOllamaMessages([
      {
        role: "user",
        content: "Compare.",
        attachments: [
          { type: "image", dataUrl: `data:image/png;base64,${PNG}` },
          { type: "image", dataUrl: `data:image/jpeg;base64,${PNG}` },
        ],
      },
    ]) as Array<Record<string, unknown>>;
    expect(typeof msg.content).toBe("string");
    expect(msg.images).toEqual([PNG, PNG]);
  });

  it("drops an http image link and keeps the text", () => {
    const [msg] = toOllamaMessages([
      { role: "user", content: "Look.", attachments: [{ type: "image", dataUrl: "https://x.test/a.png" }] },
    ]) as Array<Record<string, unknown>>;
    expect(msg).toEqual({ role: "user", content: "Look." });
  });

  it("drops PDFs, which Ollama cannot read, and keeps content a string", () => {
    const [msg] = toOllamaMessages([
      {
        role: "user",
        content: "Summarize.",
        attachments: [{ type: "pdf", name: "a.pdf", dataUrl: "data:application/pdf;base64,JVBERi0=" }],
      },
    ]) as Array<Record<string, unknown>>;
    expect(msg).toEqual({ role: "user", content: "Summarize." });
  });
});

describe("the /api/chat body on the second turn", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("streamChat sends arguments as an object", async () => {
    let body = "";
    const fake = vi.fn(async (_url: string, init: { body: string }) => {
      body = init.body;
      return fakeStreamResponse([
        JSON.stringify({ message: { content: "Done." }, done: true, prompt_eval_count: 1, eval_count: 1 }) + "\n",
      ]);
    });
    vi.stubGlobal("fetch", fake);
    vi.stubGlobal("window", { fetch: fake });

    await ollamaProvider.streamChat({ model: "qwen3.5:9b", messages: history }, "http://localhost:11434", () => {});

    const sent = JSON.parse(body) as { messages: Array<{ tool_calls?: Array<{ function: { arguments: unknown } }> }> };
    expect(sent.messages[1].tool_calls?.[0].function.arguments).toEqual({ folder: "Personal" });
    expect(body).not.toContain('"arguments":"');
  });
});

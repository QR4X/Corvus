import { describe, it, expect, vi, afterEach } from "vitest";
import { ollamaProvider, toOllamaMessages } from "../src/providers/ollama";
import type { ProviderMessage } from "../src/providers/base";
import { fakeStreamResponse } from "./helpers/streamMock";

const historico: ProviderMessage[] = [
  { role: "user", content: "Move my Lisbon trip note into a Personal folder." },
  {
    role: "assistant",
    content: "",
    toolCalls: [{ id: "call_1", name: "vault_list", arguments: { folder: "Personal" } }],
  },
  { role: "tool", toolCallId: "call_1", content: "Folder does not exist: Personal" },
];

describe("toOllamaMessages — o histórico no formato do Ollama", () => {
  it("arguments vai como OBJETO, não string JSON", () => {
    const [, assistente] = toOllamaMessages(historico) as Array<Record<string, unknown>>;
    const chamadas = assistente.tool_calls as Array<{ function: { name: string; arguments: unknown } }>;
    expect(chamadas[0].function).toEqual({ name: "vault_list", arguments: { folder: "Personal" } });
    expect(typeof chamadas[0].function.arguments).toBe("object");
  });

  it("content do assistente nunca vai null", () => {
    const semTexto: ProviderMessage[] = [
      { role: "assistant", content: "", toolCalls: [{ id: "c", name: "vault_read", arguments: { path: "a.md" } }] },
    ];
    const [assistente] = toOllamaMessages(semTexto) as Array<Record<string, unknown>>;
    expect(assistente.content).toBe("");
  });

  it("a resposta da ferramenta leva o tool_name da chamada", () => {
    const [, , ferramenta] = toOllamaMessages(historico) as Array<Record<string, unknown>>;
    expect(ferramenta).toEqual({ role: "tool", content: "Folder does not exist: Personal", tool_name: "vault_list" });
  });

  it("mensagens comuns passam como estão", () => {
    const [usuario] = toOllamaMessages(historico) as Array<Record<string, unknown>>;
    expect(usuario).toEqual({ role: "user", content: "Move my Lisbon trip note into a Personal folder." });
  });
});

describe("toOllamaMessages — imagem anexada", () => {

  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==";

  it("o texto volta a ser string e a imagem vai em `images`, em base64 cru", () => {
    const [msg] = toOllamaMessages([
      {
        role: "user",
        content: "What color is this?",
        attachments: [{ type: "image", dataUrl: `data:image/png;base64,${PNG}`, mimeType: "image/png" }],
      },
    ]) as Array<Record<string, unknown>>;
    expect(msg).toEqual({ role: "user", content: "What color is this?", images: [PNG] });
  });

  it("várias imagens, todas em `images`; content nunca é lista", () => {
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

  it("link http não é imagem que dê pra mandar: cai, o texto fica", () => {
    const [msg] = toOllamaMessages([
      { role: "user", content: "Look.", attachments: [{ type: "image", dataUrl: "https://x.test/a.png" }] },
    ]) as Array<Record<string, unknown>>;
    expect(msg).toEqual({ role: "user", content: "Look." });
  });

  it("PDF o Ollama não lê: a parte cai e o content continua string", () => {
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

describe("o corpo que sai pro /api/chat na segunda volta", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("streamChat manda arguments como objeto", async () => {
    let corpo = "";
    const fake = vi.fn(async (_url: string, init: { body: string }) => {
      corpo = init.body;
      return fakeStreamResponse([
        JSON.stringify({ message: { content: "Done." }, done: true, prompt_eval_count: 1, eval_count: 1 }) + "\n",
      ]);
    });
    vi.stubGlobal("fetch", fake);
    vi.stubGlobal("window", { fetch: fake });

    await ollamaProvider.streamChat({ model: "qwen3.5:9b", messages: historico }, "http://localhost:11434", () => {});

    const enviado = JSON.parse(corpo) as { messages: Array<{ tool_calls?: Array<{ function: { arguments: unknown } }> }> };
    expect(enviado.messages[1].tool_calls?.[0].function.arguments).toEqual({ folder: "Personal" });
    expect(corpo).not.toContain('"arguments":"');
  });
});

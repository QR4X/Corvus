import { describe, it, expect } from "vitest";
import {
  mapHttpError,
  buildChatBody,
  parseOpenAIChatMessage,
} from "../src/providers/_shared";

const userReq = (extra: Record<string, unknown> = {}) => ({
  model: "gpt-4o",
  messages: [{ role: "user" as const, content: "hi" }],
  ...extra,
});

describe("mapHttpError", () => {
  it("status OK (2xx) → null", () => {
    expect(mapHttpError(200, {}, { label: "X" })).toBeNull();
  });
  it("401 → invalid-key", () => {
    expect(mapHttpError(401, {}, { label: "X" })?.code).toBe("invalid-key");
  });
  it("403 vira invalid-key só quando declarado em authStatuses", () => {
    expect(mapHttpError(403, {}, { label: "X" })?.code).toBe("unknown");
    expect(
      mapHttpError(403, {}, { label: "X", authStatuses: [401, 403] })?.code
    ).toBe("invalid-key");
  });
  it("429 → rate-limit", () => {
    expect(mapHttpError(429, {}, { label: "X" })?.code).toBe("rate-limit");
  });
  it("5xx/408/409 → rate-limit (transiente/retryável, inclui 529 overloaded)", () => {

    expect(mapHttpError(500, {}, { label: "X" })?.code).toBe("rate-limit");
    expect(mapHttpError(503, {}, { label: "X" })?.code).toBe("rate-limit");
    expect(mapHttpError(529, {}, { label: "X" })?.code).toBe("rate-limit");
    expect(mapHttpError(408, {}, { label: "X" })?.code).toBe("rate-limit");
  });
  it("outro erro → unknown com o detalhe da API", () => {

    const err = mapHttpError(422, { error: { message: "boom" } }, { label: "NIM" });
    expect(err?.code).toBe("unknown");
    expect(err?.message).toContain("boom");
  });
});

describe("buildChatBody", () => {
  it("usa o campo de max tokens pedido + clampa", () => {
    const b = buildChatBody(userReq({ maxTokens: 999999 }), {
      provider: "openai",
      maxTokensField: "max_completion_tokens",
    });
    expect(b.max_completion_tokens).toBe(16384); 
    expect(b.max_tokens).toBeUndefined();
  });

  it("aplica a paramPolicy na temperatura (gpt-4o passa, o3 omite)", () => {
    expect(
      buildChatBody(userReq({ temperature: 0.3 }), { provider: "openai" }).temperature
    ).toBe(0.3);
    expect(
      buildChatBody(
        { model: "o3-mini", messages: [{ role: "user", content: "hi" }], temperature: 0.3 },
        { provider: "openai" }
      ).temperature
    ).toBeUndefined();
  });

  it("stream + includeUsage setam stream_options", () => {
    const b = buildChatBody(userReq(), {
      provider: "openai",
      stream: true,
      includeUsage: true,
    });
    expect(b.stream).toBe(true);
    expect(b.stream_options).toEqual({ include_usage: true });
  });

  it("tools viram formato function + tool_choice auto", () => {
    const b = buildChatBody(
      userReq({ tools: [{ name: "f", description: "d", parameters: {} }] }),
      { provider: "openai" }
    );
    expect(Array.isArray(b.tools)).toBe(true);
    expect(b.tool_choice).toBe("auto");
  });
});

describe("parseOpenAIChatMessage — tool calls tortas", () => {
  const msg = (tool_calls: unknown[]) =>
    parseOpenAIChatMessage({ content: "oi", tool_calls } as never);

  it("tool call sem `function` é descartada, não derruba a resposta", () => {
    const r = msg([{ type: "function", id: "a" }]);
    expect(r.content).toBe("oi");
    expect(r.toolCalls).toBeUndefined();
  });

  it("tool call sem `name` é descartada — não há o que chamar", () => {
    const r = msg([{ type: "function", id: "a", function: { arguments: "{}" } }]);
    expect(r.toolCalls).toBeUndefined();
  });

  it("sem `id` ganha um gerado, pra fechar o loop do agente", () => {
    const r = msg([{ type: "function", function: { name: "ler", arguments: "{}" } }]);
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls?.[0].name).toBe("ler");
    expect(r.toolCalls?.[0].id).toMatch(/^call_/);
  });

  it("arguments ausente vira {} em vez de quebrar o JSON.parse", () => {
    const r = msg([{ type: "function", id: "x", function: { name: "ler" } }]);
    expect(r.toolCalls?.[0].arguments).toEqual({});
  });

  it("arguments inválido bloqueia o lote e sinaliza o erro", () => {
    const r = msg([
      { type: "function", id: "x", function: { name: "ler", arguments: "{nao é json" } },
    ]);
    expect(r.toolCalls).toBeUndefined();
    expect(r.invalidToolCalls).toBe(true);
  });

  it("um lote misto não executa só parte das ações", () => {
    const r = msg([
      { type: "function", id: "a", function: {} },
      { type: "function", id: "b", function: { name: "ok", arguments: '{"n":1}' } },
    ]);
    expect(r.toolCalls).toBeUndefined();
    expect(r.invalidToolCalls).toBe(true);
  });

  it("entrada que não é do tipo function é ignorada", () => {
    const r = msg([{ type: "outro", function: { name: "ler", arguments: "{}" } }]);
    expect(r.toolCalls).toBeUndefined();
  });
});

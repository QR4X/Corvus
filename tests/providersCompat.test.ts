import { describe, it, expect, afterEach } from "vitest";
import { __setRequestUrl } from "obsidian";
import {
  claudeVersao,
  esforcoDoProvider,
  maxOutputTokens,
  paramPolicy,
  pensaAntes,
  pisoPensando,
  resolveMaxTokens,
  resolveTemperature,
} from "../src/providers/paramPolicy";
import { buildChatBody } from "../src/providers/_shared";
import { anthropicProvider } from "../src/providers/anthropic";
import { contextoDoOllama, ollamaProvider, tokensDoPedido } from "../src/providers/ollama";
import type { ProviderRequest } from "../src/providers/base";

const pedido = (model: string, extra: Partial<ProviderRequest> = {}): ProviderRequest => ({
  model,
  messages: [{ role: "user", content: "Oi" }],
  maxTokens: 512,
  temperature: 0.7,
  ...extra,
});

describe("claudeVersao — lê família e versão de qualquer id", () => {
  it("nome primeiro, com data, com ponto (OpenRouter) e sem número", () => {
    expect(claudeVersao("claude-opus-4-8")).toEqual({ familia: "opus", maior: 4, menor: 8 });
    expect(claudeVersao("claude-haiku-4-5-20251001")).toEqual({ familia: "haiku", maior: 4, menor: 5 });
    expect(claudeVersao("claude-sonnet-4-20250514")).toEqual({ familia: "sonnet", maior: 4, menor: 0 });
    expect(claudeVersao("anthropic/claude-opus-4.8")).toEqual({ familia: "opus", maior: 4, menor: 8 });
    expect(claudeVersao("claude-fable-5-1")).toEqual({ familia: "fable", maior: 5, menor: 1 });
    expect(claudeVersao("claude-mythos-preview")?.familia).toBe("mythos");
  });

  it("número primeiro (geração 3)", () => {
    expect(claudeVersao("claude-3-5-sonnet-latest")).toEqual({ familia: "sonnet", maior: 3, menor: 5 });
    expect(claudeVersao("anthropic/claude-3.7-sonnet")).toEqual({ familia: "sonnet", maior: 3, menor: 7 });
    expect(claudeVersao("claude-3-haiku-20240307")).toEqual({ familia: "haiku", maior: 3, menor: 0 });
  });

  it("não é Claude → null", () => {
    expect(claudeVersao("gpt-5")).toBeNull();
    expect(claudeVersao("gemini-2.5-pro")).toBeNull();
  });
});

describe("temperatura — quem aceita, até quanto", () => {
  it("Claude atuais recusam qualquer temperatura: o campo nem vai", () => {
    for (const m of [
      "claude-fable-5-1",
      "claude-fable-5",
      "claude-mythos-preview",
      "claude-opus-5-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-sonnet-5-5",
      "claude-sonnet-5",
      "anthropic/claude-opus-4.8",
    ]) {
      expect(resolveTemperature("anthropic", m, 0.7), m).toBeUndefined();
    }
  });

  it("Claude anteriores ao Opus 4.7 continuam recebendo (0..1)", () => {
    expect(resolveTemperature("anthropic", "claude-haiku-4-5-20251001", 0.7)).toBe(0.7);
    expect(resolveTemperature("anthropic", "claude-opus-4-6", 0.5)).toBe(0.5);
    expect(resolveTemperature("anthropic", "claude-opus-4-5-20251101", 1.8)).toBe(1);
  });

  it("Claude que não dá pra ler fica sem (omitir nunca é 400)", () => {
    expect(resolveTemperature("anthropic", "claude-algo-novo", 0.7)).toBeUndefined();
  });

  it("NVIDIA NIM vai até 1 — acima disso, manda 1", () => {
    expect(paramPolicy("nim", "meta/llama-3.1-70b-instruct").tempMax).toBe(1);
    expect(resolveTemperature("nim", "meta/llama-3.1-70b-instruct", 1.6)).toBe(1);
    expect(resolveTemperature("nim", "meta/llama-3.1-70b-instruct", 0.7)).toBe(0.7);
  });
});

describe("teto de saída — o que a API aceita em max_tokens", () => {
  it("Claude por versão (platform.claude.com › Output limits)", () => {
    expect(maxOutputTokens("anthropic", "claude-haiku-4-5-20251001")).toBe(64000);
    expect(maxOutputTokens("anthropic", "claude-opus-4-5-20251101")).toBe(64000);
    expect(maxOutputTokens("anthropic", "claude-sonnet-4-5-20250929")).toBe(64000);
    expect(maxOutputTokens("anthropic", "claude-opus-4-1-20250805")).toBe(32000);
    expect(maxOutputTokens("anthropic", "claude-sonnet-4-6")).toBe(128000);
    expect(maxOutputTokens("anthropic", "claude-opus-5-5")).toBe(128000);
    expect(maxOutputTokens("anthropic", "claude-fable-5-1")).toBe(128000);
    expect(maxOutputTokens("anthropic", "claude-3-haiku-20240307")).toBe(4096);
  });

  it("o Max (sem teto) no Haiku 4.5 não passa mais dos 64K", () => {
    expect(resolveMaxTokens("anthropic", "claude-haiku-4-5-20251001", 159000, "max")).toBe(64000);
  });

  it("NIM capa em 4096 — menos o DeepSeek, que fica nos 8k dele (o V4 Pro aceita 16k)", () => {
    expect(maxOutputTokens("nim", "meta/llama-3.1-70b-instruct")).toBe(4096);
    expect(maxOutputTokens("nim", "deepseek-ai/deepseek-v4-pro")).toBe(8192);
  });

  it("NIM pede temperatura ACIMA de 0 (DeepSeek V4 Pro): 0 vira 0.01", () => {
    expect(resolveTemperature("nim", "deepseek-ai/deepseek-v4-pro", 0)).toBe(0.01);
    expect(resolveTemperature("nim", "deepseek-ai/deepseek-v4-pro", 0.6)).toBe(0.6);
  });
});

describe("modelos que pensam antes de responder", () => {
  it("quem pensa", () => {
    for (const [p, m] of [
      ["openai", "gpt-5"],
      ["openai", "o3"],
      ["anthropic", "claude-opus-5-5"],
      ["anthropic", "claude-fable-5-1"],
      ["gemini", "gemini-2.5-pro"],
      ["gemini", "gemini-3.5-flash"],
      ["nim", "deepseek-ai/deepseek-r1"],
      ["ollama", "gpt-oss:20b"],
    ]) {
      expect(pensaAntes(p, m), `${p} ${m}`).toBe(true);
    }
  });

  it("quem não pensa (ou só se pedirem)", () => {
    for (const [p, m] of [
      ["openai", "gpt-4o"],
      ["openai", "gpt-5-chat-latest"],
      ["anthropic", "claude-opus-4-8"],
      ["anthropic", "claude-haiku-4-5-20251001"],
      ["gemini", "gemini-2.5-flash-lite"],
      ["gemini", "gemini-2.0-flash"],
      ["ollama", "llama3.2"],
    ]) {
      expect(pensaAntes(p, m), `${p} ${m}`).toBe(false);
    }
  });

  it("ganham um piso no max_tokens (senão o pensamento come tudo e a resposta vem vazia)", () => {
    expect(resolveMaxTokens("openai", "gpt-5", 512, "low")).toBe(16000);
    expect(resolveMaxTokens("anthropic", "claude-opus-5-5", 2048, "med")).toBe(16000);
    expect(resolveMaxTokens("gemini", "gemini-2.5-pro", 6000, "high")).toBe(32000);
    expect(resolveMaxTokens("anthropic", "claude-fable-5-1", 16000, "xhigh")).toBe(64000);

    expect(resolveMaxTokens("anthropic", "claude-opus-5-5", 1200)).toBe(pisoPensando());

    expect(resolveMaxTokens("nim", "deepseek-ai/deepseek-r1", 512, "low")).toBe(8192);
  });

  it("quem não pensa recebe o tamanho do nível, sem piso", () => {
    expect(resolveMaxTokens("openai", "gpt-4o", 512, "low")).toBe(512);
    expect(resolveMaxTokens("anthropic", "claude-haiku-4-5-20251001", 512, "low")).toBe(512);
  });
});

describe("o nível vira o 'quanto pensar' de cada provider", () => {
  it("Claude: output_config.effort, nos níveis que o modelo tem", () => {
    const de = (m: string, e: Parameters<typeof esforcoDoProvider>[2]) =>
      esforcoDoProvider("anthropic", m, e);
    expect(de("claude-opus-5-5", "low")).toEqual({ campo: "output_config", valor: { effort: "low" } });
    expect(de("claude-opus-5-5", "xhigh")?.valor).toEqual({ effort: "xhigh" });
    expect(de("claude-opus-5-5", "max")?.valor).toEqual({ effort: "max" });

    expect(de("claude-sonnet-4-6", "xhigh")?.valor).toEqual({ effort: "high" });
    expect(de("claude-sonnet-4-6", "max")?.valor).toEqual({ effort: "max" });

    expect(de("claude-opus-4-5-20251101", "max")?.valor).toEqual({ effort: "high" });

    expect(de("claude-mythos-preview", "xhigh")?.valor).toEqual({ effort: "high" });

    expect(de("claude-haiku-4-5-20251001", "low")).toBeNull();
    expect(de("claude-sonnet-4-5-20250929", "low")).toBeNull();
  });

  it("OpenAI: reasoning_effort low/medium/high nos de raciocínio — fora os -pro", () => {
    expect(esforcoDoProvider("openai", "gpt-5", "med")).toEqual({ campo: "reasoning_effort", valor: "medium" });
    expect(esforcoDoProvider("openai", "o3", "max")).toEqual({ campo: "reasoning_effort", valor: "high" });
    expect(esforcoDoProvider("openai", "gpt-5-pro", "low")).toBeNull();
    expect(esforcoDoProvider("openai", "o1-mini", "low")).toBeNull();
    expect(esforcoDoProvider("openai", "gpt-4o", "low")).toBeNull();
  });

  it("Gemini: reasoning_effort nos que pensam; OpenRouter: reasoning.effort só nos da OpenAI", () => {
    expect(esforcoDoProvider("gemini", "gemini-2.5-pro", "low")).toEqual({ campo: "reasoning_effort", valor: "low" });
    expect(esforcoDoProvider("gemini", "gemini-2.0-flash", "low")).toBeNull();
    expect(esforcoDoProvider("openrouter", "openai/gpt-5", "high")).toEqual({
      campo: "reasoning",
      valor: { effort: "high" },
    });
    expect(esforcoDoProvider("openrouter", "anthropic/claude-opus-5.5", "high")).toBeNull();
  });

  it("NIM, Ollama e pedido sem nível: nada", () => {
    expect(esforcoDoProvider("nim", "deepseek-ai/deepseek-r1", "low")).toBeNull();
    expect(esforcoDoProvider("ollama", "gpt-oss:20b", "low")).toBeNull();
    expect(esforcoDoProvider("openai", "gpt-5", undefined)).toBeNull();
  });
});

describe("o corpo que sai pra API", () => {
  it("OpenAI GPT-5 no Low: sem temperatura, piso de 16k, reasoning_effort low", () => {
    const body = buildChatBody(pedido("gpt-5", { effort: "low" }), {
      provider: "openai",
      maxTokensField: "max_completion_tokens",
    });
    expect(body.temperature).toBeUndefined();
    expect(body.max_completion_tokens).toBe(16000);
    expect(body.reasoning_effort).toBe("low");
  });

  it("OpenAI GPT-4o no Low: como sempre foi", () => {
    const body = buildChatBody(pedido("gpt-4o", { effort: "low" }), {
      provider: "openai",
      maxTokensField: "max_completion_tokens",
    });
    expect(body.temperature).toBe(0.7);
    expect(body.max_completion_tokens).toBe(512);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("Gemini 2.5 Pro no Medium: reasoning_effort medium e piso", () => {
    const body = buildChatBody(pedido("gemini-2.5-pro", { effort: "med", maxTokens: 2048 }), {
      provider: "gemini",
    });
    expect(body.reasoning_effort).toBe("medium");
    expect(body.max_tokens).toBe(16000);
  });

  it("NIM com temperatura 1.6: vai 1", () => {
    const body = buildChatBody(pedido("meta/llama-3.1-70b-instruct", { temperature: 1.6 }), {
      provider: "nim",
    });
    expect(body.temperature).toBe(1);
  });
});

describe("Anthropic — o corpo de verdade (requestUrl capturado)", () => {
  afterEach(() => __setRequestUrl(null));

  const capturar = async (req: ProviderRequest) => {
    let corpo: Record<string, unknown> = {};
    __setRequestUrl(async (o) => {
      corpo = JSON.parse((o as { body: string }).body);
      return {
        status: 200,
        json: { content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } },
        text: "",
        headers: {},
      };
    });
    await anthropicProvider.chat(req, "sk-ant-teste");
    return corpo;
  };

  it("Opus 5.5 no Low: sem temperatura, effort low, piso de 16k", async () => {
    const corpo = await capturar(pedido("claude-opus-5-5", { effort: "low" }));
    expect(corpo.temperature).toBeUndefined();
    expect(corpo.output_config).toEqual({ effort: "low" });
    expect(corpo.max_tokens).toBe(16000);
  });

  it("Haiku 4.5 no Max: temperatura (até 1), sem effort, max_tokens no teto de 64K", async () => {
    const corpo = await capturar(pedido("claude-haiku-4-5-20251001", { effort: "max", maxTokens: 159000, temperature: 0.2 }));
    expect(corpo.temperature).toBe(0.2);
    expect(corpo.output_config).toBeUndefined();
    expect(corpo.max_tokens).toBe(64000);
  });
});

describe("Ollama — a janela (num_ctx) cabe o que vai", () => {
  afterEach(() => __setRequestUrl(null));

  it("o menor degrau que cabe prompt + resposta, sem passar do modelo", () => {
    expect(contextoDoOllama(2000, 2000, 131072)).toBe(8192);
    expect(contextoDoOllama(9000, 2000, 131072)).toBe(16384);
    expect(contextoDoOllama(30000, 16000, 131072)).toBe(65536); 
    expect(contextoDoOllama(9000, 2000, 4096)).toBe(4096); 
    expect(contextoDoOllama(90000, 2000)).toBe(32768); 
  });

  it("estima o pedido: texto, ferramentas e imagens", () => {
    const req: ProviderRequest = {
      model: "x",
      messages: [{ role: "user", content: "a".repeat(3000), attachments: [{ type: "image", dataUrl: "data:," }] }],
      tools: [],
    };
    expect(tokensDoPedido(req)).toBe(1000 + 1000);
  });

  it("o /api/chat leva num_ctx e o piso de quem pensa", async () => {
    let chat: { options?: Record<string, number> } = {};
    __setRequestUrl(async (o) => {
      const { url, body } = o as { url: string; body: string };
      if (url.endsWith("/api/show")) {
        return { status: 200, json: { model_info: { "gptoss.context_length": 131072 } }, text: "", headers: {} };
      }
      chat = JSON.parse(body);
      return { status: 200, json: { message: { content: "ok" }, done: true }, text: "", headers: {} };
    });
    await ollamaProvider.chat(pedido("gpt-oss:20b", { effort: "low" }), "http://localhost:11434");

    expect(chat.options?.num_predict).toBe(16000);

    expect(chat.options?.num_ctx).toBe(16384);
  });

  it("sem /api/show (Ollama antigo, servidor fora): até 32k, sem quebrar o pedido", async () => {
    let chat: { options?: Record<string, number> } = {};
    __setRequestUrl(async (o) => {
      const { url, body } = o as { url: string; body: string };
      if (url.endsWith("/api/show")) return { status: 404, json: undefined, text: "", headers: {} };
      chat = JSON.parse(body);
      return { status: 200, json: { message: { content: "ok" }, done: true }, text: "", headers: {} };
    });
    const res = await ollamaProvider.chat(pedido("llama3.2"), "http://localhost:11434");
    expect(res.content).toBe("ok");
    expect(chat.options?.num_ctx).toBe(8192);
    expect(chat.options?.num_predict).toBe(512);
  });
});

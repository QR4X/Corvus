import { describe, it, expect, afterEach } from "vitest";
import { __setRequestUrl } from "obsidian";
import {
  claudeVersion,
  providerEffort,
  maxOutputTokens,
  paramPolicy,
  thinksFirst,
  thinkingFloor,
  resolveMaxTokens,
  resolveTemperature,
} from "../src/providers/paramPolicy";
import { buildChatBody } from "../src/providers/_shared";
import { anthropicProvider } from "../src/providers/anthropic";
import { ollamaContextSize, ollamaProvider, estimateRequestTokens } from "../src/providers/ollama";
import type { ProviderRequest } from "../src/providers/base";

const request = (model: string, extra: Partial<ProviderRequest> = {}): ProviderRequest => ({
  model,
  messages: [{ role: "user", content: "Hi" }],
  maxTokens: 512,
  temperature: 0.7,
  ...extra,
});

describe("claudeVersion reads family and version from any id", () => {
  it("parses name-first ids with dates, dots and no number", () => {
    expect(claudeVersion("claude-opus-4-8")).toEqual({ family: "opus", major: 4, minor: 8 });
    expect(claudeVersion("claude-haiku-4-5-20251001")).toEqual({ family: "haiku", major: 4, minor: 5 });
    expect(claudeVersion("claude-sonnet-4-20250514")).toEqual({ family: "sonnet", major: 4, minor: 0 });
    expect(claudeVersion("anthropic/claude-opus-4.8")).toEqual({ family: "opus", major: 4, minor: 8 });
    expect(claudeVersion("claude-fable-5-1")).toEqual({ family: "fable", major: 5, minor: 1 });
    expect(claudeVersion("claude-mythos-preview")?.family).toBe("mythos");
  });

  it("parses number-first generation 3 ids", () => {
    expect(claudeVersion("claude-3-5-sonnet-latest")).toEqual({ family: "sonnet", major: 3, minor: 5 });
    expect(claudeVersion("anthropic/claude-3.7-sonnet")).toEqual({ family: "sonnet", major: 3, minor: 7 });
    expect(claudeVersion("claude-3-haiku-20240307")).toEqual({ family: "haiku", major: 3, minor: 0 });
  });

  it("returns null for non-Claude models", () => {
    expect(claudeVersion("gpt-5")).toBeNull();
    expect(claudeVersion("gemini-2.5-pro")).toBeNull();
  });
});

describe("temperature support and limits", () => {
  it("omits temperature for current Claude models", () => {
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

  it("keeps temperature in 0..1 for Claude before Opus 4.7", () => {
    expect(resolveTemperature("anthropic", "claude-haiku-4-5-20251001", 0.7)).toBe(0.7);
    expect(resolveTemperature("anthropic", "claude-opus-4-6", 0.5)).toBe(0.5);
    expect(resolveTemperature("anthropic", "claude-opus-4-5-20251101", 1.8)).toBe(1);
  });

  it("omits temperature for unparseable Claude ids", () => {
    expect(resolveTemperature("anthropic", "claude-something-new", 0.7)).toBeUndefined();
  });

  it("clamps NVIDIA NIM temperature to 1", () => {
    expect(paramPolicy("nim", "meta/llama-3.1-70b-instruct").tempMax).toBe(1);
    expect(resolveTemperature("nim", "meta/llama-3.1-70b-instruct", 1.6)).toBe(1);
    expect(resolveTemperature("nim", "meta/llama-3.1-70b-instruct", 0.7)).toBe(0.7);
  });
});

describe("output caps accepted in max_tokens", () => {
  it("caps Claude by version", () => {
    expect(maxOutputTokens("anthropic", "claude-haiku-4-5-20251001")).toBe(64000);
    expect(maxOutputTokens("anthropic", "claude-opus-4-5-20251101")).toBe(64000);
    expect(maxOutputTokens("anthropic", "claude-sonnet-4-5-20250929")).toBe(64000);
    expect(maxOutputTokens("anthropic", "claude-opus-4-1-20250805")).toBe(32000);
    expect(maxOutputTokens("anthropic", "claude-sonnet-4-6")).toBe(128000);
    expect(maxOutputTokens("anthropic", "claude-opus-5-5")).toBe(128000);
    expect(maxOutputTokens("anthropic", "claude-fable-5-1")).toBe(128000);
    expect(maxOutputTokens("anthropic", "claude-3-haiku-20240307")).toBe(4096);
  });

  it("keeps Max on Haiku 4.5 within 64K", () => {
    expect(resolveMaxTokens("anthropic", "claude-haiku-4-5-20251001", 159000, "max")).toBe(64000);
  });

  it("caps NIM at 4096 except DeepSeek at 8k", () => {
    expect(maxOutputTokens("nim", "meta/llama-3.1-70b-instruct")).toBe(4096);
    expect(maxOutputTokens("nim", "deepseek-ai/deepseek-v4-pro")).toBe(8192);
  });

  it("raises a zero NIM temperature to 0.01", () => {
    expect(resolveTemperature("nim", "deepseek-ai/deepseek-v4-pro", 0)).toBe(0.01);
    expect(resolveTemperature("nim", "deepseek-ai/deepseek-v4-pro", 0.6)).toBe(0.6);
  });
});

describe("models that think before answering", () => {
  it("detects thinking models", () => {
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
      expect(thinksFirst(m), `${p} ${m}`).toBe(true);
    }
  });

  it("detects models that do not think by default", () => {
    for (const [p, m] of [
      ["openai", "gpt-4o"],
      ["openai", "gpt-5-chat-latest"],
      ["anthropic", "claude-opus-4-8"],
      ["anthropic", "claude-haiku-4-5-20251001"],
      ["gemini", "gemini-2.5-flash-lite"],
      ["gemini", "gemini-2.0-flash"],
      ["ollama", "llama3.2"],
    ]) {
      expect(thinksFirst(m), `${p} ${m}`).toBe(false);
    }
  });

  it("gives thinking models a max_tokens floor", () => {
    expect(resolveMaxTokens("openai", "gpt-5", 512, "low")).toBe(16000);
    expect(resolveMaxTokens("anthropic", "claude-opus-5-5", 2048, "med")).toBe(16000);
    expect(resolveMaxTokens("gemini", "gemini-2.5-pro", 6000, "high")).toBe(32000);
    expect(resolveMaxTokens("anthropic", "claude-fable-5-1", 16000, "xhigh")).toBe(64000);

    expect(resolveMaxTokens("anthropic", "claude-opus-5-5", 1200)).toBe(thinkingFloor());

    expect(resolveMaxTokens("nim", "deepseek-ai/deepseek-r1", 512, "low")).toBe(8192);
  });

  it("gives non-thinking models the level size without a floor", () => {
    expect(resolveMaxTokens("openai", "gpt-4o", 512, "low")).toBe(512);
    expect(resolveMaxTokens("anthropic", "claude-haiku-4-5-20251001", 512, "low")).toBe(512);
  });
});

describe("effort maps to each provider reasoning setting", () => {
  it("Claude uses output_config.effort within supported levels", () => {
    const effortOf = (m: string, e: Parameters<typeof providerEffort>[2]) =>
      providerEffort("anthropic", m, e);
    expect(effortOf("claude-opus-5-5", "low")).toEqual({ field: "output_config", value: { effort: "low" } });
    expect(effortOf("claude-opus-5-5", "xhigh")?.value).toEqual({ effort: "xhigh" });
    expect(effortOf("claude-opus-5-5", "max")?.value).toEqual({ effort: "max" });

    expect(effortOf("claude-sonnet-4-6", "xhigh")?.value).toEqual({ effort: "high" });
    expect(effortOf("claude-sonnet-4-6", "max")?.value).toEqual({ effort: "max" });

    expect(effortOf("claude-opus-4-5-20251101", "max")?.value).toEqual({ effort: "high" });

    expect(effortOf("claude-mythos-preview", "xhigh")?.value).toEqual({ effort: "high" });

    expect(effortOf("claude-haiku-4-5-20251001", "low")).toBeNull();
    expect(effortOf("claude-sonnet-4-5-20250929", "low")).toBeNull();
  });

  it("OpenAI uses reasoning_effort on reasoning models except -pro", () => {
    expect(providerEffort("openai", "gpt-5", "med")).toEqual({ field: "reasoning_effort", value: "medium" });
    expect(providerEffort("openai", "o3", "max")).toEqual({ field: "reasoning_effort", value: "high" });
    expect(providerEffort("openai", "gpt-5-pro", "low")).toBeNull();
    expect(providerEffort("openai", "o1-mini", "low")).toBeNull();
    expect(providerEffort("openai", "gpt-4o", "low")).toBeNull();
  });

  it("Gemini uses reasoning_effort on thinking models and OpenRouter uses reasoning.effort only for OpenAI", () => {
    expect(providerEffort("gemini", "gemini-2.5-pro", "low")).toEqual({ field: "reasoning_effort", value: "low" });
    expect(providerEffort("gemini", "gemini-2.0-flash", "low")).toBeNull();
    expect(providerEffort("openrouter", "openai/gpt-5", "high")).toEqual({
      field: "reasoning",
      value: { effort: "high" },
    });
    expect(providerEffort("openrouter", "anthropic/claude-opus-5.5", "high")).toBeNull();
  });

  it("sends nothing for NIM, Ollama or a request without effort", () => {
    expect(providerEffort("nim", "deepseek-ai/deepseek-r1", "low")).toBeNull();
    expect(providerEffort("ollama", "gpt-oss:20b", "low")).toBeNull();
    expect(providerEffort("openai", "gpt-5", undefined)).toBeNull();
  });
});

describe("request body sent to the API", () => {
  it("OpenAI GPT-5 on Low has no temperature, a 16k floor and low effort", () => {
    const body = buildChatBody(request("gpt-5", { effort: "low" }), {
      provider: "openai",
      maxTokensField: "max_completion_tokens",
    });
    expect(body.temperature).toBeUndefined();
    expect(body.max_completion_tokens).toBe(16000);
    expect(body.reasoning_effort).toBe("low");
  });

  it("OpenAI GPT-4o on Low keeps temperature and size", () => {
    const body = buildChatBody(request("gpt-4o", { effort: "low" }), {
      provider: "openai",
      maxTokensField: "max_completion_tokens",
    });
    expect(body.temperature).toBe(0.7);
    expect(body.max_completion_tokens).toBe(512);
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("Gemini 2.5 Pro on Medium uses medium effort and the floor", () => {
    const body = buildChatBody(request("gemini-2.5-pro", { effort: "med", maxTokens: 2048 }), {
      provider: "gemini",
    });
    expect(body.reasoning_effort).toBe("medium");
    expect(body.max_tokens).toBe(16000);
  });

  it("NIM clamps temperature 1.6 to 1", () => {
    const body = buildChatBody(request("meta/llama-3.1-70b-instruct", { temperature: 1.6 }), {
      provider: "nim",
    });
    expect(body.temperature).toBe(1);
  });
});

describe("Anthropic request body", () => {
  afterEach(() => __setRequestUrl(null));

  const capture = async (req: ProviderRequest) => {
    let body: Record<string, unknown> = {};
    __setRequestUrl(async (o) => {
      body = JSON.parse((o as { body: string }).body);
      return {
        status: 200,
        json: { content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } },
        text: "",
        headers: {},
      };
    });
    await anthropicProvider.chat(req, "sk-ant-test");
    return body;
  };

  it("Opus 5.5 on Low has no temperature, low effort and a 16k floor", async () => {
    const body = await capture(request("claude-opus-5-5", { effort: "low" }));
    expect(body.temperature).toBeUndefined();
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.max_tokens).toBe(16000);
  });

  it("Haiku 4.5 on Max keeps temperature, has no effort and caps max_tokens at 64K", async () => {
    const body = await capture(request("claude-haiku-4-5-20251001", { effort: "max", maxTokens: 159000, temperature: 0.2 }));
    expect(body.temperature).toBe(0.2);
    expect(body.output_config).toBeUndefined();
    expect(body.max_tokens).toBe(64000);
  });
});

describe("Ollama num_ctx fits the request", () => {
  afterEach(() => __setRequestUrl(null));

  it("picks the smallest step that fits prompt and answer within the model limit", () => {
    expect(ollamaContextSize(2000, 2000, 131072)).toBe(8192);
    expect(ollamaContextSize(9000, 2000, 131072)).toBe(16384);
    expect(ollamaContextSize(30000, 16000, 131072)).toBe(65536);
    expect(ollamaContextSize(9000, 2000, 4096)).toBe(4096);
    expect(ollamaContextSize(90000, 2000)).toBe(32768);
  });

  it("estimates text, tools and images", () => {
    const req: ProviderRequest = {
      model: "x",
      messages: [{ role: "user", content: "a".repeat(3000), attachments: [{ type: "image", dataUrl: "data:," }] }],
      tools: [],
    };
    expect(estimateRequestTokens(req)).toBe(1000 + 1000);
  });

  it("sends num_ctx and the thinking floor to /api/chat", async () => {
    let chat: { options?: Record<string, number> } = {};
    __setRequestUrl(async (o) => {
      const { url, body } = o as { url: string; body: string };
      if (url.endsWith("/api/show")) {
        return { status: 200, json: { model_info: { "gptoss.context_length": 131072 } }, text: "", headers: {} };
      }
      chat = JSON.parse(body);
      return { status: 200, json: { message: { content: "ok" }, done: true }, text: "", headers: {} };
    });
    await ollamaProvider.chat(request("gpt-oss:20b", { effort: "low" }), "http://localhost:11434");

    expect(chat.options?.num_predict).toBe(16000);

    expect(chat.options?.num_ctx).toBe(16384);
  });

  it("still sends the request without /api/show", async () => {
    let chat: { options?: Record<string, number> } = {};
    __setRequestUrl(async (o) => {
      const { url, body } = o as { url: string; body: string };
      if (url.endsWith("/api/show")) return { status: 404, json: undefined, text: "", headers: {} };
      chat = JSON.parse(body);
      return { status: 200, json: { message: { content: "ok" }, done: true }, text: "", headers: {} };
    });
    const res = await ollamaProvider.chat(request("llama3.2"), "http://localhost:11434");
    expect(res.content).toBe("ok");
    expect(chat.options?.num_ctx).toBe(8192);
    expect(chat.options?.num_predict).toBe(512);
  });
});

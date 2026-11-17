import { afterEach, describe, expect, it } from "vitest";
import { __setRequestUrl } from "obsidian";
import {
  isReasoningWithToolsRejection,
  noReasoningWithTools,
} from "../src/providers/paramPolicy";
import { buildChatBody } from "../src/providers/_shared";
import { OpenAIProvider } from "../src/providers/openai";
import type { ProviderRequest } from "../src/providers/base";

const toolDef = {
  name: "vault_list",
  description: "List files.",
  parameters: { type: "object", properties: {} },
};
const request = (model: string, withTools = true): ProviderRequest =>
  ({
    model,
    messages: [{ role: "user", content: "organize my vault" }],
    effort: "med",
    ...(withTools ? { tools: [toolDef] } : {}),
  }) as unknown as ProviderRequest;

const REJECTION = (m: string) =>
  `Function tools with reasoning_effort are not supported for ${m} in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.`;

afterEach(() => __setRequestUrl(null));

describe("models that reject tools with reasoning", () => {
  it("flags GPT-5.4 and later variants but not earlier models or the o-series", () => {
    for (const m of ["gpt-5.4", "gpt-5.4-mini", "gpt-5.5", "gpt-5.6-luna", "gpt-5.10", "gpt-6"]) {
      expect(noReasoningWithTools("openai", m), m).toBe(true);
    }
    for (const m of ["gpt-5", "gpt-5.1", "gpt-5.2-pro", "gpt-5.3", "gpt-4o", "gpt-4.1", "o3", "o4-mini", "chatgpt-4o-latest"]) {
      expect(noReasoningWithTools("openai", m), m).toBe(false);
    }
  });

  it("applies only to the OpenAI provider", () => {
    expect(noReasoningWithTools("openrouter", "openai/gpt-5.4")).toBe(false);
  });

  it("recognizes the OpenAI rejection message and no other 400", () => {
    expect(isReasoningWithToolsRejection(REJECTION("gpt-5.4"))).toBe(true);
    expect(isReasoningWithToolsRejection("Unsupported parameter: 'temperature'")).toBe(false);
  });
});

describe("request body", () => {
  const body = (model: string, withTools = true) =>
    buildChatBody(request(model, withTools), {
      provider: "openai",
      maxTokensField: "max_completion_tokens",
    });

  it("sends gpt-5.4 without reasoning when tools are present and with reasoning otherwise", () => {
    expect(body("gpt-5.4").reasoning_effort).toBe("none");
    expect(body("gpt-5.4", false).reasoning_effort).toBe("medium");
  });

  it("keeps reasoning for gpt-5 even with tools", () => {
    expect(body("gpt-5").reasoning_effort).toBe("medium");
  });
});

describe("new model that rejects: learns and retries", () => {
  it("retries the first 400 without reasoning and remembers the model", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    __setRequestUrl(async (opts) => {
      const o = opts as { body: string };
      const b = JSON.parse(o.body) as Record<string, unknown>;
      bodies.push(b);
      if (b.reasoning_effort !== "none") {
        return { status: 400, json: { error: { message: REJECTION("o5") } } };
      }
      return {
        status: 200,
        json: { choices: [{ message: { role: "assistant", content: "Done." } }] },
      };
    });
    const r = await new OpenAIProvider().chat(request("o5"), "sk-test");
    expect(r.content).toBe("Done.");
    expect(bodies.map((b) => b.reasoning_effort)).toEqual(["medium", "none"]);
    expect(noReasoningWithTools("openai", "o5")).toBe(true);
  });

  it("does not retry other 400 errors", async () => {
    let n = 0;
    __setRequestUrl(async () => {
      n++;
      return { status: 400, json: { error: { message: "Unsupported parameter: 'temperature'" } } };
    });
    await expect(new OpenAIProvider().chat(request("o4-mini"), "sk-test")).rejects.toThrow(/temperature/);
    expect(n).toBe(1);
  });
});

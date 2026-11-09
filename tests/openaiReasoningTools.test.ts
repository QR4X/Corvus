import { afterEach, describe, expect, it } from "vitest";
import { __setRequestUrl } from "obsidian";
import {
  ehRecusaDeRaciocinioComFerramentas,
  semRaciocinioComFerramentas,
} from "../src/providers/paramPolicy";
import { buildChatBody } from "../src/providers/_shared";
import { OpenAIProvider } from "../src/providers/openai";
import type { ProviderRequest } from "../src/providers/base";

const ferramenta = {
  name: "vault_list",
  description: "List files.",
  parameters: { type: "object", properties: {} },
};
const pedido = (model: string, comFerramentas = true): ProviderRequest =>
  ({
    model,
    messages: [{ role: "user", content: "organize my vault" }],
    effort: "med",
    ...(comFerramentas ? { tools: [ferramenta] } : {}),
  }) as unknown as ProviderRequest;

const RECUSA = (m: string) =>
  `Function tools with reasoning_effort are not supported for ${m} in /v1/chat/completions. To use function tools, use /v1/responses or set reasoning_effort to 'none'.`;

afterEach(() => __setRequestUrl(null));

describe("quem recusa ferramentas com raciocínio", () => {
  it("GPT-5.4 em diante (e variantes); antes disso e o-series, não", () => {
    for (const m of ["gpt-5.4", "gpt-5.4-mini", "gpt-5.5", "gpt-5.6-luna", "gpt-5.10", "gpt-6"]) {
      expect(semRaciocinioComFerramentas("openai", m), m).toBe(true);
    }
    for (const m of ["gpt-5", "gpt-5.1", "gpt-5.2-pro", "gpt-5.3", "gpt-4o", "gpt-4.1", "o3", "o4-mini", "chatgpt-4o-latest"]) {
      expect(semRaciocinioComFerramentas("openai", m), m).toBe(false);
    }
  });

  it("só no provider da OpenAI (o OpenRouter tem o seu próprio caminho)", () => {
    expect(semRaciocinioComFerramentas("openrouter", "openai/gpt-5.4")).toBe(false);
  });

  it("reconhece a mensagem da OpenAI, e não outro 400", () => {
    expect(ehRecusaDeRaciocinioComFerramentas(RECUSA("gpt-5.4"))).toBe(true);
    expect(ehRecusaDeRaciocinioComFerramentas("Unsupported parameter: 'temperature'")).toBe(false);
  });
});

describe("o corpo do pedido", () => {
  const corpo = (model: string, comFerramentas = true) =>
    buildChatBody(pedido(model, comFerramentas), {
      provider: "openai",
      maxTokensField: "max_completion_tokens",
    });

  it("gpt-5.4 com ferramentas vai sem raciocínio; sem ferramentas, com", () => {
    expect(corpo("gpt-5.4").reasoning_effort).toBe("none");
    expect(corpo("gpt-5.4", false).reasoning_effort).toBe("medium");
  });

  it("gpt-5 (que aceita) continua com raciocínio mesmo com ferramentas", () => {
    expect(corpo("gpt-5").reasoning_effort).toBe("medium");
  });
});

describe("modelo novo que recusa: aprende e tenta de novo", () => {
  it("o primeiro 400 vira um segundo pedido sem raciocínio, e o modelo fica lembrado", async () => {
    const corpos: Array<Record<string, unknown>> = [];
    __setRequestUrl(async (opts) => {
      const o = opts as { body: string };
      const b = JSON.parse(o.body) as Record<string, unknown>;
      corpos.push(b);
      if (b.reasoning_effort !== "none") {
        return { status: 400, json: { error: { message: RECUSA("o5") } } };
      }
      return {
        status: 200,
        json: { choices: [{ message: { role: "assistant", content: "Pronto." } }] },
      };
    });
    const r = await new OpenAIProvider().chat(pedido("o5"), "sk-teste");
    expect(r.content).toBe("Pronto.");
    expect(corpos.map((b) => b.reasoning_effort)).toEqual(["medium", "none"]);
    expect(semRaciocinioComFerramentas("openai", "o5")).toBe(true);
  });

  it("outro 400 não é tentado de novo", async () => {
    let n = 0;
    __setRequestUrl(async () => {
      n++;
      return { status: 400, json: { error: { message: "Unsupported parameter: 'temperature'" } } };
    });
    await expect(new OpenAIProvider().chat(pedido("o4-mini"), "sk-teste")).rejects.toThrow(/temperature/);
    expect(n).toBe(1);
  });
});

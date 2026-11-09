import { describe, it, expect } from "vitest";
import { modelLogo, vendorDoModelo } from "../src/providers/modelLogo";
import { getModelFamily } from "../src/providers/modelFamily";

describe("vendorDoModelo", () => {
  it("lê o prefixo", () => {
    expect(vendorDoModelo("anthropic/claude-3.5-sonnet")).toBe("anthropic");
    expect(vendorDoModelo("Meta-Llama/Llama-3.3")).toBe("meta-llama");
  });

  it("id sem fabricante devolve vazio", () => {
    expect(vendorDoModelo("gpt-5")).toBe("");
    expect(vendorDoModelo("")).toBe("");
  });
});

describe("modelLogo", () => {
  it("usa a MARCA quando temos", () => {
    expect(modelLogo("anthropic/claude-3.5-sonnet")).toBe("logo-anthropic");
    expect(modelLogo("openai/gpt-4o")).toBe("logo-openai");
    expect(modelLogo("google/gemini-2.5-pro")).toBe("logo-gemini");
    expect(modelLogo("nvidia/nemotron-70b")).toBe("logo-nvidia");
  });

  it("reconhece a casa mesmo sem fabricante no id", () => {

    expect(modelLogo("gpt-5")).toBe("logo-openai");
    expect(modelLogo("claude-opus-4-8")).toBe("logo-anthropic");
    expect(modelLogo("gemini-3-pro")).toBe("logo-gemini");
  });

  it("os FABRICANTES de modelo também têm mark", () => {

    expect(modelLogo("meta-llama/llama-3.3-70b:free")).toBe("logo-meta");
    expect(modelLogo("deepseek/deepseek-chat:free")).toBe("logo-deepseek");
    expect(modelLogo("mistralai/mixtral-8x22b")).toBe("logo-mistral");
    expect(modelLogo("qwen/qwen2.5-72b")).toBe("logo-qwen");
    expect(modelLogo("z-ai/glm-4.6")).toBe("logo-zai");
  });

  it("reconhece o fabricante pelo NOME, como o Ollama escreve", () => {

    expect(modelLogo("llama3.2")).toBe("logo-meta");
    expect(modelLogo("qwen2.5")).toBe("logo-qwen");
    expect(modelLogo("deepseek-r1")).toBe("logo-deepseek");
    expect(modelLogo("mistral")).toBe("logo-mistral");
  });

  it("os de mídia também: FLUX, Stability, Nano Banana", () => {
    expect(modelLogo("black-forest-labs/flux-1.1-pro")).toBe("logo-flux");
    expect(modelLogo("stabilityai/sdxl")).toBe("logo-stability");
    expect(modelLogo("gemini-2.5-flash-image-nano-banana")).toBe(
      "logo-nanobanana"
    );
  });

  it("o que sobra cai no brasão da FAMÍLIA — nunca num genérico", () => {

    expect(modelLogo("x-ai/grok-2")).toBe(getModelFamily("grok").icon);
  });

  it("nunca devolve vazio — setIcon com nome vazio não desenha nada", () => {
    for (const id of ["", "coisa/estranha", "???"])
      expect(modelLogo(id).length).toBeGreaterThan(0);
  });
});

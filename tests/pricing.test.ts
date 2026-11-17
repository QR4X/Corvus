import { describe, it, expect } from "vitest";
import { getPricing } from "../src/usage/pricing";

describe("getPricing free and paid tiers", () => {
  it("cloud chat models are paid", () => {
    expect(getPricing("openai", "gpt-4o").tier).toBe("paid");
    expect(getPricing("anthropic", "claude-opus-4-8").tier).toBe("paid");
  });

  it("claude-fable-5 is paid with unknown prices", () => {
    const p = getPricing("anthropic", "claude-fable-5");
    expect(p.tier).toBe("paid");
    expect(p.inputPerMillion).toBeNull();
  });

  it("local Ollama is always free", () => {
    expect(getPricing("ollama", "llama3.2").tier).toBe("free");
    expect(getPricing("ollama", "any-model").tier).toBe("free");
  });

  it("OpenRouter :free models are free and others follow the upstream price", () => {
    expect(getPricing("openrouter", "meta-llama/llama-3.1-8b:free").tier).toBe(
      "free"
    );
    expect(getPricing("openrouter", "anthropic/claude-sonnet-4").tier).toBe(
      "paid"
    );
  });

  it("an unknown provider or model is unknown, so the UI hides the badge", () => {
    expect(getPricing("provider-fake", "x").tier).toBe("unknown");
    expect(getPricing("openai", "").tier).toBe("unknown");
  });
});

import { describe, it, expect } from "vitest";
import {
  EMBEDDING_PROVIDERS,
  providerBlockedReason,
  providerCredential,
  providerHealth,
} from "../src/core/providersMeta";
import { modeloSalvoPara } from "../src/core/defaultModel";
import type { CorvusSettings } from "../src/settings";

function fake(settings: Record<string, unknown>): CorvusSettings {
  return settings as unknown as CorvusSettings;
}

describe("providerHealth", () => {
  it("is off without a credential", () => {
    expect(providerHealth(fake({}), "openai")).toBe("off");
    expect(providerHealth(fake({ openaiApiKey: "   " }), "openai")).toBe("off");
  });

  it("is unknown with a credential and no test yet", () => {
    expect(providerHealth(fake({ openaiApiKey: "sk-1" }), "openai")).toBe("unknown");
  });

  it("follows the last connection test", () => {
    const ok = fake({ openaiApiKey: "sk-1", providerStatus: { openai: { ok: true, at: 1 } } });
    const bad = fake({ openaiApiKey: "sk-1", providerStatus: { openai: { ok: false, at: 1 } } });
    expect(providerHealth(ok, "openai")).toBe("ok");
    expect(providerHealth(bad, "openai")).toBe("fail");
  });

  it("a stored test does not revive a provider without credential", () => {
    const p = fake({ providerStatus: { openai: { ok: true, at: 1 } } });
    expect(providerHealth(p, "openai")).toBe("off");
  });

  it("ollama is configured by its endpoint, not a key", () => {
    expect(providerHealth(fake({ ollamaEndpoint: "" }), "ollama")).toBe("off");
    expect(providerHealth(fake({ ollamaEndpoint: "http://localhost:11434" }), "ollama")).toBe("unknown");
  });

  it("a blocked provider always has a reason; a usable one never does", () => {
    expect(providerBlockedReason(fake({}), "gemini")).toMatch(/credential/i);
    expect(
      providerBlockedReason(fake({ geminiApiKey: "k", providerStatus: { gemini: { ok: false, at: 1 } } }), "gemini")
    ).toMatch(/test failed/i);
    expect(providerBlockedReason(fake({ geminiApiKey: "k" }), "gemini")).toBeNull();
  });
});

describe("provider table", () => {
  it("each provider reads its own credential and saved model", () => {
    const s = fake({ anthropicApiKey: "a", nimApiKey: "n", nimModel: "m-nim", defaultModel: "m-oa" });
    expect(providerCredential(s, "anthropic")).toBe("a");
    expect(providerCredential(s, "nim")).toBe("n");
    expect(modeloSalvoPara(s, "nim")).toBe("m-nim");
  });

  it("an unknown provider id resolves to OpenAI, like getProvider does", () => {
    const s = fake({ openaiApiKey: "sk", defaultModel: "m-oa" });
    expect(providerCredential(s, "legacy")).toBe("sk");
    expect(modeloSalvoPara(s, "legacy")).toBe("m-oa");
  });

  it("anthropic has no embedding models", () => {
    expect(EMBEDDING_PROVIDERS).not.toContain("anthropic");
    expect(EMBEDDING_PROVIDERS).toContain("ollama");
  });
});

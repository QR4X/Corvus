import { describe, it, expect } from "vitest";
import {
  getFreeDailyTokens,
  getModelCapabilities,
} from "../src/providers/modelCapabilities";
import { buildModelCatalog, byVendor } from "../src/ui/modelCatalog";

describe("getFreeDailyTokens", () => {
  it("returns both shared-traffic program quotas", () => {
    expect(getFreeDailyTokens("openai", "gpt-5.4")).toBe(250_000);
    expect(getFreeDailyTokens("openai", "o3")).toBe(250_000);
    expect(getFreeDailyTokens("openai", "gpt-5.4-mini")).toBe(2_500_000);
    expect(getFreeDailyTokens("openai", "o4-mini")).toBe(2_500_000);
  });

  it("accepts the dated id the API returns", () => {
    expect(getFreeDailyTokens("openai", "gpt-4o-2024-08-06")).toBe(250_000);
    expect(getFreeDailyTokens("openai", "gpt-4o-mini-2024-07-18")).toBe(
      2_500_000
    );
  });

  it("matches exactly, not by prefix, so mini and nano have their own quota", () => {
    expect(getFreeDailyTokens("openai", "gpt-5.2")).toBe(250_000);
    expect(getFreeDailyTokens("openai", "gpt-5.2-mini")).toBeNull();
    expect(getFreeDailyTokens("openai", "gpt-4o-audio-preview")).toBeNull();
    expect(getFreeDailyTokens("openai", "dall-e-3")).toBeNull();
  });

  it("applies to OpenAI only", () => {
    expect(getFreeDailyTokens("openrouter", "gpt-4o")).toBeNull();
    expect(getFreeDailyTokens("nim", "o3")).toBeNull();
    expect(getFreeDailyTokens("openai", "")).toBeNull();
  });

  it("marks models with a daily quota as free in capabilities", () => {
    expect(getModelCapabilities("openai", "gpt-5-mini").free).toBe(true);
    expect(getModelCapabilities("openai", "o1").free).toBe(true);
    expect(getModelCapabilities("openai", "tts-1").free).toBeUndefined();
  });
});

describe("buildModelCatalog", () => {
  const models = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-5",
    "gpt-5-mini",
    "o3",
    "o3-mini",
    "dall-e-3",
    "tts-1",
  ];

  it("groups by role and returns only roles that have models", () => {
    const roles = buildModelCatalog("openai", models).map((r) => r.id);
    expect(roles).toContain("chat");
    expect(roles).toContain("reasoning");
    expect(roles).toContain("image");
    expect(roles).toContain("tts");
    expect(roles).not.toContain("video");
    expect(roles).not.toContain("embedding");
  });

  it("orders families within a role canonically, newest lineage first", () => {
    const chat = buildModelCatalog("openai", models).find(
      (r) => r.id === "chat"
    );
    expect(chat?.families.map((f) => f.id)).toEqual(["gpt5", "gpt4o"]);
    expect(chat?.count).toBe(4);
  });

  it("sorts models within a family", () => {
    const chat = buildModelCatalog("openai", models).find(
      (r) => r.id === "chat"
    );
    expect(chat?.families[0].models).toEqual(["gpt-5", "gpt-5-mini"]);
  });

  it("gives each family a label and an icon for its section", () => {
    const reasoning = buildModelCatalog("openai", models).find(
      (r) => r.id === "reasoning"
    );
    expect(reasoning?.families[0].label).toBe("o-series");
    expect(reasoning?.families[0].icon).toBeTruthy();
  });

  it("keeps embedding models out of chat", () => {
    const roles = buildModelCatalog("openai", [
      "gpt-4o",
      "text-embedding-3-small",
      "text-embedding-3-large",
    ]);
    const embed = roles.find((r) => r.id === "embedding");
    expect(embed?.count).toBe(2);
    expect(roles.find((r) => r.id === "chat")?.count).toBe(1);
  });

  it("returns no roles for an empty list", () => {
    expect(buildModelCatalog("openai", [])).toEqual([]);
  });

  it("works with OpenRouter vendor ids", () => {
    const roles = buildModelCatalog("openrouter", [
      "meta/llama-3.3-70b-instruct:free",
      "qwen/qwen-2.5-7b:free",
      "deepseek/deepseek-r1",
    ]);
    const families = roles.flatMap((r) => r.families.map((f) => f.id));
    expect(families).toContain("llama");
    expect(families).toContain("qwen");
    expect(families).toContain("deepseek");
  });

  it("classifies openrouter/auto as chat in the router family", () => {
    const roles = buildModelCatalog("openrouter", ["openrouter/auto"]);
    expect(roles).toHaveLength(1);
    expect(roles[0].id).toBe("chat");
    expect(roles[0].families[0].id).toBe("router");
    expect(roles[0].families[0].label).toBe("Auto Router");

    const byMaker = byVendor(roles);
    expect(byMaker[0].vendor.name).toBe("OpenRouter");
  });
});

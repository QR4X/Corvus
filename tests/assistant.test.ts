import { describe, it, expect } from "vitest";
import {
  isFree,
  pickAssistant,
  unavailableReason,
} from "../src/assistant/model";
import { isZeroPrice } from "../src/providers/openrouterFree";
import {
  parseObject,
  parseProject,
  parseSkill,
  parseQuestion,
  parseText,
  extractJson,
} from "../src/assistant/parse";
import {
  promptDescription,
  promptInstructions,
  promptProject,
  promptSkill,
} from "../src/assistant/prompt";

const ICONS = ["folder", "graduation-cap", "plane"];
const COLORS = ["default", "#e5484d", "#4361ee"];

describe("pickAssistant", () => {
  it("uses the explicit choice", () => {
    expect(
      pickAssistant({
        assistantProvider: "openai",
        assistantModel: "gpt-5",
        favoriteModels: { openrouter: ["x/y:free"] },
      })
    ).toEqual({ provider: "openai", model: "gpt-5" });
  });

  it("picks the free OpenRouter favorite without a choice", () => {
    expect(
      pickAssistant({
        favoriteModels: { openrouter: ["paid/model", "meta/llama:free"] },
        activeModels: { openrouter: ["other/thing:free"] },
      })
    ).toEqual({ provider: "openrouter", model: "meta/llama:free" });
  });

  it("falls back to known models without a free favorite", () => {
    expect(
      pickAssistant({
        favoriteModels: { openrouter: ["paid/model"] },
        activeModels: { openrouter: ["paid/other", "x/y:free"] },
      })
    ).toEqual({ provider: "openrouter", model: "x/y:free" });
  });

  it("returns null when nothing usable exists", () => {
    expect(pickAssistant({})).toBeNull();
    expect(
      pickAssistant({ activeModels: { openrouter: ["only/paid"] } })
    ).toBeNull();
  });

  it("treats the :free suffix as free, like the rest of the app", () => {
    expect(isFree("meta/llama:free")).toBe(true);
    expect(isFree("meta/llama")).toBe(false);
  });
});

describe("unavailableReason", () => {
  it("gives different reasons for a missing model and a missing key", () => {
    const noModel = unavailableReason(null, () => true);
    const noKey = unavailableReason(
      { provider: "openrouter", model: "x:free" },
      () => false
    );
    expect(noModel).toMatch(/model/i);
    expect(noKey).toMatch(/key/i);
    expect(noModel).not.toBe(noKey);
  });

  it("returns null with a model and a key", () => {
    expect(
      unavailableReason({ provider: "openrouter", model: "x:free" }, () => true)
    ).toBeNull();
  });
});

describe("extractJson", () => {
  it("strips the code fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("finds the object in the middle of prose", () => {
    expect(extractJson('Sure! {"a":1} Hope that helps.')).toBe('{"a":1}');
  });

  it("returns null instead of throwing when there is no object", () => {
    expect(extractJson("sorry, I did not understand")).toBeNull();
    expect(parseObject("sorry")).toBeNull();
  });

  it("returns null for broken JSON", () => {
    expect(parseObject('{"a": }')).toBeNull();
  });
});

describe("parseSkill", () => {
  const ok = {
    name: "Weekly review",
    description: "Go through the week",
    icon: "graduation-cap",
    color: "#4361ee",
    mode: "vault-qa",
    body: "Go through this week's notes and tell me what moved.",
  };

  it("passes a valid skill through", () => {
    expect(parseSkill(ok, ICONS, "folder", COLORS)).toEqual(ok);
  });

  it("resets a color outside the palette to default", () => {
    expect(parseSkill({ ...ok, color: "purple" }, ICONS, "folder", COLORS)?.color).toBe(
      "default"
    );
    expect(parseSkill(ok, ICONS, "folder")?.color).toBe("default");
  });

  it("replaces a made up icon with the default", () => {
    const r = parseSkill({ ...ok, icon: "sparkles-2" }, ICONS, "folder", COLORS);
    expect(r?.icon).toBe("folder");
  });

  it("clears a made up mode so the skill opens in the current one", () => {
    expect(parseSkill({ ...ok, mode: "wizard" }, ICONS, "folder", COLORS)?.mode).toBe("");
    expect(parseSkill({ ...ok, mode: "agent" }, ICONS, "folder", COLORS)?.mode).toBe(
      "agent"
    );
  });

  it("rejects a skill without a body", () => {
    expect(parseSkill({ ...ok, body: "" }, ICONS, "folder", COLORS)).toBeNull();
    expect(parseSkill({ ...ok, body: 42 }, ICONS, "folder", COLORS)).toBeNull();
  });

  it("strips a code fence around the body", () => {
    const r = parseSkill({ ...ok, body: "```\ndo this\n```" }, ICONS, "folder", COLORS);
    expect(r?.body).toBe("do this");
  });

  it("caps a very long name", () => {
    const r = parseSkill({ ...ok, name: "a".repeat(300) }, ICONS, "folder", COLORS);
    expect(r!.name.length).toBeLessThanOrEqual(60);
  });
});

describe("parseProject", () => {
  const vault = ["Refs/Kuhn.md", "Journal/2026-09.md", "Ideas.md"];
  const ok = {
    name: "Thesis",
    icon: "graduation-cap",
    color: "#4361ee",
    instructions: "Always cite the source.",
    notes: ["Refs/Kuhn.md"],
  };

  it("passes a valid project through", () => {
    expect(parseProject(ok, ICONS, COLORS, vault)).toEqual(ok);
  });

  it("drops made up notes", () => {
    const r = parseProject(
      { ...ok, notes: ["Refs/Kuhn.md", "Projects/Thesis.md"] },
      ICONS,
      COLORS,
      vault
    );
    expect(r?.notes).toEqual(["Refs/Kuhn.md"]);
  });

  it("keeps a repeated note once", () => {
    const r = parseProject(
      { ...ok, notes: ["Ideas.md", "Ideas.md"] },
      ICONS,
      COLORS,
      vault
    );
    expect(r?.notes).toEqual(["Ideas.md"]);
  });

  it("resets a color outside the palette to default", () => {
    expect(parseProject({ ...ok, color: "red" }, ICONS, COLORS, vault)?.color).toBe(
      "default"
    );
  });

  it("rejects a project without a name", () => {
    expect(parseProject({ ...ok, name: "  " }, ICONS, COLORS, vault)).toBeNull();
  });

  it("handles `notes` that is not a list", () => {
    expect(
      parseProject({ ...ok, notes: "Refs/Kuhn.md" }, ICONS, COLORS, vault)?.notes
    ).toEqual([]);
  });

  it("accepts empty instructions", () => {
    const r = parseProject({ ...ok, instructions: "" }, ICONS, COLORS, vault);
    expect(r?.instructions).toBe("");
  });
});

describe("parseQuestion", () => {
  it("returns the guided mode question", () => {
    expect(parseQuestion({ ask: "What do you use this for?" })).toBe(
      "What do you use this for?"
    );
  });

  it("returns an empty string without a question", () => {
    expect(parseQuestion({ draft: {} })).toBe("");
    expect(parseQuestion(null)).toBe("");
  });
});

describe("prompts", () => {
  it("lists the allowed icons in the skill prompt", () => {
    const p = promptSkill("direct", ICONS, COLORS);
    expect(p).toContain("graduation-cap");
    expect(p).toContain("Do not ask questions");
  });

  it("lets guided mode ask a capped number of questions", () => {
    expect(promptSkill("guided", ICONS, COLORS)).toMatch(/up to 3/i);
  });

  it("asks for an empty notes list when the vault has no notes", () => {
    const p = promptProject("direct", ICONS, COLORS, []);
    expect(p).toContain('"notes": []');
    expect(p).not.toContain("Notes in this vault");
  });

  it("lists vault notes exactly", () => {
    const p = promptProject("direct", ICONS, COLORS, ["A/b.md"]);
    expect(p).toContain("- A/b.md");
  });

  it("asks guided mode for exactly three options and forbids a fourth", () => {
    const p = promptSkill("guided", ICONS, COLORS);
    expect(p).toMatch(/EXACTLY 3 options/);
    expect(p).toMatch(/never offer one yourself/i);
  });
});

describe("single field prompts", () => {
  it("gives the description prompt the skill body as source material", () => {
    const p = promptDescription({ name: "Weekly review", body: "Go through…" });
    expect(p).toContain("Weekly review");
    expect(p).toContain("Go through…");
    expect(p).toContain('{"text": "..."}');
  });

  it("gives the instructions prompt the project and its attached notes", () => {
    const p = promptInstructions({
      name: "Thesis",
      notes: ["Refs/Kuhn.md"],
      current: "",
    });
    expect(p).toContain("Project: Thesis");
    expect(p).toContain("- Refs/Kuhn.md");
    expect(p).toMatch(/ADD to how the app already works/);
  });

  it("includes existing text so it gets improved", () => {
    const p = promptInstructions({
      name: "Thesis",
      notes: [],
      current: "Always cite the source.",
    });
    expect(p).toContain("Always cite the source.");
    expect(p).toMatch(/improve on it/i);
  });

  it("omits empty sections for a blank field", () => {
    const p = promptInstructions({ name: "Thesis", notes: [], current: "   " });
    expect(p).not.toMatch(/improve on it/i);
    expect(p).not.toContain("Notes already attached");
  });

  it("parseText caps the length and strips the fence", () => {
    expect(parseText({ text: "```\nhi\n```" }, 140)).toBe("hi");
    expect(parseText({ text: "a".repeat(500) }, 140).length).toBe(140);
    expect(parseText({ text: 42 }, 140)).toBe("");
    expect(parseText(null, 140)).toBe("");
  });
});

describe("prompt language", () => {
  it("tells every prompt to write in the app language", () => {
    const all = [
      promptSkill("direct", ICONS, COLORS),
      promptProject("direct", ICONS, COLORS, []),
      promptDescription({ name: "x", body: "y" }),
      promptInstructions({
        name: "x",
        notes: [],
        current: "",
      }),
    ];
    for (const p of all) {
      expect(p).toContain("Write EVERY field in English");
      expect(p).not.toMatch(/same language the person used/i);
    }
  });
});

describe("free by price, not by name", () => {
  it("trusts the discovered list even without the suffix", () => {
    expect(isFree("vendor/model")).toBe(false);
    expect(isFree("vendor/model", ["vendor/model"])).toBe(true);
  });

  it("still guesses from the suffix without a list", () => {
    expect(isFree("x/y:free", [])).toBe(true);
    expect(isFree("x/y:free")).toBe(true);
  });

  it("lets the assistant pick a free model without the suffix", () => {
    const target = pickAssistant({
      activeModels: { openrouter: ["paid/one", "free/two"] },
      freeModels: { openrouter: ["free/two"] },
    });
    expect(target).toEqual({ provider: "openrouter", model: "free/two" });
  });

  it("finds a model when the scan ran but nothing was curated", () => {
    expect(
      pickAssistant({ freeModels: { openrouter: ["a/b"] } })
    ).toEqual({ provider: "openrouter", model: "a/b" });
  });
});

describe("isZeroPrice", () => {
  it("is free when both sides are zero", () => {
    expect(isZeroPrice({ prompt: "0", completion: "0" })).toBe(true);
    expect(isZeroPrice({ prompt: 0, completion: 0 })).toBe(true);
  });

  it("is not free with free input and paid output", () => {
    expect(isZeroPrice({ prompt: "0", completion: "0.0000004" })).toBe(false);
  });

  it("assumes nothing without a price", () => {
    expect(isZeroPrice(undefined)).toBe(false);
    expect(isZeroPrice({})).toBe(false);
    expect(isZeroPrice({ prompt: "free", completion: "free" })).toBe(false);
  });
});

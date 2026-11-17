import { describe, it, expect } from "vitest";
import { filterModels, groupModels, mergeModelOptions } from "../src/ui/modelGroups";

describe("groupModels", () => {
  it("groups models by kind with chat first", () => {
    const g = groupModels("openai", [
      "gpt-image-1",
      "gpt-4o",
      "o3",
      "tts-1",
      "gpt-5",
    ]);
    expect(g[0].label).toBe("Chat");
    expect(g[0].models).toEqual(["gpt-4o", "gpt-5"]);
    const labels = g.map((x) => x.label);
    expect(labels).toContain("Reasoning");
    expect(labels).toContain("Image");
    expect(labels).toContain("Voice");

    expect(labels.indexOf("Chat")).toBe(0);
  });

  it("gives every group a label", () => {
    const g = groupModels("openai", ["gpt-4o", "o1", "dall-e-3"]);
    for (const x of g) expect(x.label.length).toBeGreaterThan(0);
  });

  it("never drops a model", () => {
    const input = [
      "gpt-4o",
      "o1",
      "dall-e-3",
      "tts-1-hd",
      "text-embedding-3-small",
      "model-nobody-knows",
    ];
    const output = groupModels("openai", input).flatMap((g) => g.models);
    expect(output.slice().sort()).toEqual(input.slice().sort());
  });

  it("preserves order within each group", () => {
    const g = groupModels("openai", ["gpt-5", "gpt-4o", "gpt-4o-mini"]);
    expect(g[0].models).toEqual(["gpt-5", "gpt-4o", "gpt-4o-mini"]);
  });

  it("keeps the label when there is a single group", () => {
    const g = groupModels("openai", ["gpt-4o", "gpt-5"]);
    expect(g).toHaveLength(1);
    expect(g[0].label).toBe("Chat");
  });

  it("returns no groups for an empty list", () => {
    expect(groupModels("openai", [])).toEqual([]);
  });
});

describe("filterModels", () => {
  const pretty = (m: string) =>
    m.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const list = ["gpt-5.4", "gpt-4o-mini", "o3", "dall-e-3"];

  it("matches by id", () => {
    expect(filterModels(list, "4o", pretty)).toEqual(["gpt-4o-mini"]);
  });

  it("matches by the displayed name", () => {
    expect(filterModels(list, "gpt 5", pretty)).toEqual(["gpt-5.4"]);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(filterModels(list, "  DALL  ", pretty)).toEqual(["dall-e-3"]);
  });

  it("returns a copy of everything for an empty query", () => {
    const r = filterModels(list, "   ", pretty);
    expect(r).toEqual(list);
    expect(r).not.toBe(list);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterModels(list, "zzz", pretty)).toEqual([]);
  });
});

describe("mergeModelOptions", () => {
  it("puts catalog models after the selected ones", () => {
    expect(
      mergeModelOptions(["gpt-5", "gpt-4o"], ["gpt-4o", "gpt-5-mini"])
    ).toEqual(["gpt-5", "gpt-4o", "gpt-5-mini"]);
  });

  it("does not repeat a model present on both sides", () => {
    const r = mergeModelOptions(["a/b"], ["a/b", "c/d"]);
    expect(r).toEqual(["a/b", "c/d"]);
  });

  it("keeps the list unchanged without catalog results", () => {
    expect(mergeModelOptions(["gpt-4o", "o3"], [])).toEqual(["gpt-4o", "o3"]);
  });

  it("drops empty catalog ids", () => {
    expect(mergeModelOptions([], ["", "gpt-4o"])).toEqual(["gpt-4o"]);
  });
});

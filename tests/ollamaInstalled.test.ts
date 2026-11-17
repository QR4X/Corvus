import { describe, expect, it } from "vitest";
import {
  OLLAMA_DEFAULTS_UNTIL_0923,
  alignToInstalled,
  isFactoryList,
  fullModelName,
  type OllamaLists,
} from "../src/core/ollamaDefault";
import { looksLikeOllamaEmbedding } from "../src/rag/types";

const lists = (p: Partial<OllamaLists> = {}): OllamaLists => ({
  active: [],
  favorites: [],
  model: "",
  seen: null,
  ...p,
});
const align = (l: OllamaLists, installed: string[]) =>
  alignToInstalled(l, installed, looksLikeOllamaEmbedding);

describe("the name as Ollama stores it", () => {
  it("no tag means latest, an explicit tag stays, and a registry port is not a tag", () => {
    expect(fullModelName("llama3.2")).toBe("llama3.2:latest");
    expect(fullModelName("qwen3.5:9b")).toBe("qwen3.5:9b");
    expect(fullModelName("hf.co/bartowski/Llama-3.2-1B-GGUF:Q4_K_M")).toBe(
      "hf.co/bartowski/Llama-3.2-1B-GGUF:Q4_K_M"
    );
    expect(fullModelName("localhost:5000/library/phi3")).toBe("localhost:5000/library/phi3:latest");
  });
});

describe("the Ollama lists follow what is installed", () => {
  it("factory guesses leave and the installed model joins and becomes the default", () => {
    const after = align(
      lists({ active: OLLAMA_DEFAULTS_UNTIL_0923.active, model: OLLAMA_DEFAULTS_UNTIL_0923.model }),
      ["qwen3.5:9b"]
    );
    expect(after.active).toEqual(["qwen3.5:9b"]);
    expect(after.model).toBe("qwen3.5:9b");
    expect(after.seen).toEqual(["qwen3.5:9b"]);
  });

  it("a factory guess that happens to be installed does not hide the rest", () => {
    const after = align(
      lists({ active: OLLAMA_DEFAULTS_UNTIL_0923.active, model: OLLAMA_DEFAULTS_UNTIL_0923.model }),
      ["gemma3:4b", "llama3.2:latest", "qwen3:8b"]
    );
    expect(after.active).toEqual(["gemma3:4b", "llama3.2:latest", "qwen3:8b"]);

    expect(after.model).toBe("llama3.2:latest");

    const next = align(after, [...after.seen, "phi4:14b"]);
    expect(next.active).toEqual(["gemma3:4b", "llama3.2:latest", "qwen3:8b", "phi4:14b"]);
  });

  it("a model installed under another spelling (:latest) stays with the user's spelling", () => {
    const after = align(
      lists({ active: ["llama3.2", "mistral"], model: "llama3.2", favorites: ["llama3.2", "mistral"] }),
      ["llama3.2:latest"]
    );
    expect(after.active).toEqual(["llama3.2"]);
    expect(after.favorites).toEqual(["llama3.2"]);
    expect(after.model).toBe("llama3.2");
  });

  it("a newly pulled model appears and a hidden one stays hidden", () => {
    const before = lists({ active: ["qwen3.5:9b"], seen: ["qwen3.5:9b", "gemma3:4b"], model: "qwen3.5:9b" });
    const after = align(before, ["qwen3.5:9b", "gemma3:4b", "llama3.2:latest"]);
    expect(after.active).toEqual(["qwen3.5:9b", "llama3.2:latest"]);
  });

  it("an embedding model is not added to the chat list on its own", () => {
    const after = align(lists(), ["nomic-embed-text:latest", "qwen3.5:9b"]);
    expect(after.active).toEqual(["qwen3.5:9b"]);
    expect(after.model).toBe("qwen3.5:9b");
  });

  it("on the first fetch, the user's enabled and installed models win and nothing is added on its own", () => {
    const after = align(
      lists({ active: ["qwen3.5:9b", "mistral"], model: "qwen3.5:9b" }),
      ["qwen3.5:9b", "gemma3:4b", "llama3.2:latest"]
    );
    expect(after.active).toEqual(["qwen3.5:9b"]);
    expect(after.seen).toEqual(["qwen3.5:9b", "gemma3:4b", "llama3.2:latest"]);

    const next = align(after, [...after.seen, "phi4:14b"]);
    expect(next.active).toEqual(["qwen3.5:9b", "phi4:14b"]);
  });

  it("the default model never falls on an embedding, even one enabled by hand", () => {
    const after = align(
      lists({ active: ["llama3.2", "nomic-embed-text:latest"], model: "llama3.2" }),
      ["nomic-embed-text:latest", "qwen3.5:9b"]
    );
    expect(after.active).toEqual(["nomic-embed-text:latest", "qwen3.5:9b"]);
    expect(after.model).toBe("qwen3.5:9b");

    const onlyEmbedding = align(
      lists({ active: ["nomic-embed-text:latest"], model: "llama3.2" }),
      ["nomic-embed-text:latest"]
    );
    expect(onlyEmbedding.model).toBe("");
  });

  it("an empty list with everything seen enables the chat models instead of staying empty", () => {
    const after = align(
      lists({ active: [], seen: ["qwen3.5:9b", "nomic-embed-text:latest"] }),
      ["qwen3.5:9b", "nomic-embed-text:latest"]
    );
    expect(after.active).toEqual(["qwen3.5:9b"]);
    expect(after.model).toBe("qwen3.5:9b");
  });

  it("a model removed with ollama rm leaves every list and the default falls to the first remaining", () => {
    const before = lists({
      active: ["gemma3:4b", "qwen3.5:9b"],
      favorites: ["gemma3:4b"],
      model: "gemma3:4b",
      seen: ["gemma3:4b", "qwen3.5:9b"],
    });
    const after = align(before, ["qwen3.5:9b"]);
    expect(after).toEqual({ active: ["qwen3.5:9b"], favorites: [], model: "qwen3.5:9b", seen: ["qwen3.5:9b"] });
  });

  it("Ollama without models leaves everything empty instead of the guesses", () => {
    const after = align(lists({ active: OLLAMA_DEFAULTS_UNTIL_0923.active, model: "llama3.2" }), []);
    expect(after).toEqual({ active: [], favorites: [], model: "", seen: [] });
  });

  it("already aligned lists do not change, which saving relies on", () => {
    const aligned = lists({ active: ["qwen3.5:9b"], model: "qwen3.5:9b", seen: ["qwen3.5:9b"] });
    expect(align(aligned, ["qwen3.5:9b"])).toEqual(aligned);
  });

  it("a name repeated in two spellings does not become two items", () => {
    const after = align(lists({ active: ["llama3.2", "llama3.2:latest"] }), ["llama3.2:latest"]);
    expect(after.active).toEqual(["llama3.2"]);
  });
});

describe("the list nobody picked", () => {
  it("is empty or exactly the factory guesses in any order", () => {
    expect(isFactoryList([])).toBe(true);
    expect(isFactoryList([...OLLAMA_DEFAULTS_UNTIL_0923.active].reverse())).toBe(true);
    expect(isFactoryList(["qwen3.5:9b"])).toBe(false);
    expect(isFactoryList([...OLLAMA_DEFAULTS_UNTIL_0923.active, "qwen3.5:9b"])).toBe(false);
    expect(isFactoryList(OLLAMA_DEFAULTS_UNTIL_0923.active.slice(0, 3))).toBe(false);
  });
});

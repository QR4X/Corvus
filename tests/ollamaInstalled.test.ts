import { describe, expect, it } from "vitest";
import {
  OLLAMA_DEFAULTS_UNTIL_0923,
  alignToInstalled,
  isFactoryList,
  fullModelName,
  type OllamaLists,
} from "../src/core/ollamaDefault";
import { looksLikeOllamaEmbedding } from "../src/rag/types";
import { EN_US } from "../src/i18n/en-us";

const listas = (p: Partial<OllamaLists> = {}): OllamaLists => ({
  active: [],
  favorites: [],
  model: "",
  seen: null,
  ...p,
});
const alinhar = (l: OllamaLists, instalados: string[]) =>
  alignToInstalled(l, instalados, looksLikeOllamaEmbedding);

describe("o nome como o Ollama guarda", () => {
  it("sem tag é a latest; com tag fica; porta de registro não é tag", () => {
    expect(fullModelName("llama3.2")).toBe("llama3.2:latest");
    expect(fullModelName("qwen3.5:9b")).toBe("qwen3.5:9b");
    expect(fullModelName("hf.co/bartowski/Llama-3.2-1B-GGUF:Q4_K_M")).toBe(
      "hf.co/bartowski/Llama-3.2-1B-GGUF:Q4_K_M"
    );
    expect(fullModelName("localhost:5000/library/phi3")).toBe("localhost:5000/library/phi3:latest");
  });
});

describe("as listas do Ollama seguem o que está instalado", () => {
  it("o caso do Rafael: os palpites de fábrica saem, o instalado entra e vira o padrão", () => {
    const depois = alinhar(
      listas({ active: OLLAMA_DEFAULTS_UNTIL_0923.active, model: OLLAMA_DEFAULTS_UNTIL_0923.model }),
      ["qwen3.5:9b"]
    );
    expect(depois.active).toEqual(["qwen3.5:9b"]);
    expect(depois.model).toBe("qwen3.5:9b");
    expect(depois.seen).toEqual(["qwen3.5:9b"]);
  });

  it("palpite de fábrica que por acaso está instalado não esconde o resto", () => {
    const depois = alinhar(
      listas({ active: OLLAMA_DEFAULTS_UNTIL_0923.active, model: OLLAMA_DEFAULTS_UNTIL_0923.model }),
      ["gemma3:4b", "llama3.2:latest", "qwen3:8b"]
    );
    expect(depois.active).toEqual(["gemma3:4b", "llama3.2:latest", "qwen3:8b"]);

    expect(depois.model).toBe("llama3.2:latest");

    const outra = alinhar(depois, [...depois.seen, "phi4:14b"]);
    expect(outra.active).toEqual(["gemma3:4b", "llama3.2:latest", "qwen3:8b", "phi4:14b"]);
  });

  it("instalado com outra grafia (a :latest) continua, com a grafia da pessoa", () => {
    const depois = alinhar(
      listas({ active: ["llama3.2", "mistral"], model: "llama3.2", favorites: ["llama3.2", "mistral"] }),
      ["llama3.2:latest"]
    );
    expect(depois.active).toEqual(["llama3.2"]);
    expect(depois.favorites).toEqual(["llama3.2"]);
    expect(depois.model).toBe("llama3.2");
  });

  it("modelo novo (um ollama pull) aparece; o escondido continua escondido", () => {
    const antes = listas({ active: ["qwen3.5:9b"], seen: ["qwen3.5:9b", "gemma3:4b"], model: "qwen3.5:9b" });
    const depois = alinhar(antes, ["qwen3.5:9b", "gemma3:4b", "llama3.2:latest"]);
    expect(depois.active).toEqual(["qwen3.5:9b", "llama3.2:latest"]);
  });

  it("embedding não entra sozinho na lista de conversa", () => {
    const depois = alinhar(listas(), ["nomic-embed-text:latest", "qwen3.5:9b"]);
    expect(depois.active).toEqual(["qwen3.5:9b"]);
    expect(depois.model).toBe("qwen3.5:9b");
  });

  it("primeira busca: o que a pessoa já tinha ligado e está instalado manda — nada entra sozinho", () => {

    const depois = alinhar(
      listas({ active: ["qwen3.5:9b", "mistral"], model: "qwen3.5:9b" }),
      ["qwen3.5:9b", "gemma3:4b", "llama3.2:latest"]
    );
    expect(depois.active).toEqual(["qwen3.5:9b"]);
    expect(depois.seen).toEqual(["qwen3.5:9b", "gemma3:4b", "llama3.2:latest"]);

    const outra = alinhar(depois, [...depois.seen, "phi4:14b"]);
    expect(outra.active).toEqual(["qwen3.5:9b", "phi4:14b"]);
  });

  it("o modelo padrão nunca cai num embedding, mesmo ligado à mão", () => {

    const depois = alinhar(
      listas({ active: ["llama3.2", "nomic-embed-text:latest"], model: "llama3.2" }),
      ["nomic-embed-text:latest", "qwen3.5:9b"]
    );
    expect(depois.active).toEqual(["nomic-embed-text:latest", "qwen3.5:9b"]);
    expect(depois.model).toBe("qwen3.5:9b");

    const soEmbedding = alinhar(
      listas({ active: ["nomic-embed-text:latest"], model: "llama3.2" }),
      ["nomic-embed-text:latest"]
    );
    expect(soEmbedding.model).toBe("");
  });

  it("lista vazia com tudo já visto: a busca liga os que conversam (vazia só daria o aviso)", () => {
    const depois = alinhar(
      listas({ active: [], seen: ["qwen3.5:9b", "nomic-embed-text:latest"] }),
      ["qwen3.5:9b", "nomic-embed-text:latest"]
    );
    expect(depois.active).toEqual(["qwen3.5:9b"]);
    expect(depois.model).toBe("qwen3.5:9b");
  });

  it("o que saiu com ollama rm sai de tudo; o padrão cai no primeiro que sobrou", () => {
    const antes = listas({
      active: ["gemma3:4b", "qwen3.5:9b"],
      favorites: ["gemma3:4b"],
      model: "gemma3:4b",
      seen: ["gemma3:4b", "qwen3.5:9b"],
    });
    const depois = alinhar(antes, ["qwen3.5:9b"]);
    expect(depois).toEqual({ active: ["qwen3.5:9b"], favorites: [], model: "qwen3.5:9b", seen: ["qwen3.5:9b"] });
  });

  it("Ollama sem nenhum modelo: tudo vazio (e não os palpites)", () => {
    const depois = alinhar(listas({ active: OLLAMA_DEFAULTS_UNTIL_0923.active, model: "llama3.2" }), []);
    expect(depois).toEqual({ active: [], favorites: [], model: "", seen: [] });
  });

  it("já alinhado não muda nada (a gravação depende disso)", () => {
    const certo = listas({ active: ["qwen3.5:9b"], model: "qwen3.5:9b", seen: ["qwen3.5:9b"] });
    expect(alinhar(certo, ["qwen3.5:9b"])).toEqual(certo);
  });

  it("nome repetido em duas grafias não vira dois itens", () => {
    const depois = alinhar(listas({ active: ["llama3.2", "llama3.2:latest"] }), ["llama3.2:latest"]);
    expect(depois.active).toEqual(["llama3.2"]);
  });
});

describe("a lista que ninguém escolheu", () => {
  it("vazia ou os palpites de fábrica (em qualquer ordem) — e só isso", () => {
    expect(isFactoryList([])).toBe(true);
    expect(isFactoryList([...OLLAMA_DEFAULTS_UNTIL_0923.active].reverse())).toBe(true);
    expect(isFactoryList(["qwen3.5:9b"])).toBe(false);
    expect(isFactoryList([...OLLAMA_DEFAULTS_UNTIL_0923.active, "qwen3.5:9b"])).toBe(false);
    expect(isFactoryList(OLLAMA_DEFAULTS_UNTIL_0923.active.slice(0, 3))).toBe(false);
  });
});

describe("warns when no model is selected", () => {
  it("notice exists in the engine dictionary", () => {
    expect(EN_US.ai.err.noModel("Ollama")).toMatch(/Fetch models/);
  });
});

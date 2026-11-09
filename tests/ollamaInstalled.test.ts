import { describe, expect, it } from "vitest";
import {
  FABRICA_ATE_0923,
  alinharAoInstalado,
  listaDeFabrica,
  nomeCompleto,
  type ListasDoOllama,
} from "../src/core/ollamaDefault";
import { pareceEmbeddingDoOllama } from "../src/rag/types";
import { getTranslations } from "../src/i18n";

const listas = (p: Partial<ListasDoOllama> = {}): ListasDoOllama => ({
  ativos: [],
  favoritos: [],
  modelo: "",
  vistos: null,
  ...p,
});
const alinhar = (l: ListasDoOllama, instalados: string[]) =>
  alinharAoInstalado(l, instalados, pareceEmbeddingDoOllama);

describe("o nome como o Ollama guarda", () => {
  it("sem tag é a latest; com tag fica; porta de registro não é tag", () => {
    expect(nomeCompleto("llama3.2")).toBe("llama3.2:latest");
    expect(nomeCompleto("qwen3.5:9b")).toBe("qwen3.5:9b");
    expect(nomeCompleto("hf.co/bartowski/Llama-3.2-1B-GGUF:Q4_K_M")).toBe(
      "hf.co/bartowski/Llama-3.2-1B-GGUF:Q4_K_M"
    );
    expect(nomeCompleto("localhost:5000/library/phi3")).toBe("localhost:5000/library/phi3:latest");
  });
});

describe("as listas do Ollama seguem o que está instalado", () => {
  it("o caso do Rafael: os palpites de fábrica saem, o instalado entra e vira o padrão", () => {
    const depois = alinhar(
      listas({ ativos: FABRICA_ATE_0923.ativos, modelo: FABRICA_ATE_0923.modelo }),
      ["qwen3.5:9b"]
    );
    expect(depois.ativos).toEqual(["qwen3.5:9b"]);
    expect(depois.modelo).toBe("qwen3.5:9b");
    expect(depois.vistos).toEqual(["qwen3.5:9b"]);
  });

  it("palpite de fábrica que por acaso está instalado não esconde o resto", () => {
    const depois = alinhar(
      listas({ ativos: FABRICA_ATE_0923.ativos, modelo: FABRICA_ATE_0923.modelo }),
      ["gemma3:4b", "llama3.2:latest", "qwen3:8b"]
    );
    expect(depois.ativos).toEqual(["gemma3:4b", "llama3.2:latest", "qwen3:8b"]);

    expect(depois.modelo).toBe("llama3.2:latest");

    const outra = alinhar(depois, [...depois.vistos, "phi4:14b"]);
    expect(outra.ativos).toEqual(["gemma3:4b", "llama3.2:latest", "qwen3:8b", "phi4:14b"]);
  });

  it("instalado com outra grafia (a :latest) continua, com a grafia da pessoa", () => {
    const depois = alinhar(
      listas({ ativos: ["llama3.2", "mistral"], modelo: "llama3.2", favoritos: ["llama3.2", "mistral"] }),
      ["llama3.2:latest"]
    );
    expect(depois.ativos).toEqual(["llama3.2"]);
    expect(depois.favoritos).toEqual(["llama3.2"]);
    expect(depois.modelo).toBe("llama3.2");
  });

  it("modelo novo (um ollama pull) aparece; o escondido continua escondido", () => {
    const antes = listas({ ativos: ["qwen3.5:9b"], vistos: ["qwen3.5:9b", "gemma3:4b"], modelo: "qwen3.5:9b" });
    const depois = alinhar(antes, ["qwen3.5:9b", "gemma3:4b", "llama3.2:latest"]);
    expect(depois.ativos).toEqual(["qwen3.5:9b", "llama3.2:latest"]);
  });

  it("embedding não entra sozinho na lista de conversa", () => {
    const depois = alinhar(listas(), ["nomic-embed-text:latest", "qwen3.5:9b"]);
    expect(depois.ativos).toEqual(["qwen3.5:9b"]);
    expect(depois.modelo).toBe("qwen3.5:9b");
  });

  it("primeira busca: o que a pessoa já tinha ligado e está instalado manda — nada entra sozinho", () => {

    const depois = alinhar(
      listas({ ativos: ["qwen3.5:9b", "mistral"], modelo: "qwen3.5:9b" }),
      ["qwen3.5:9b", "gemma3:4b", "llama3.2:latest"]
    );
    expect(depois.ativos).toEqual(["qwen3.5:9b"]);
    expect(depois.vistos).toEqual(["qwen3.5:9b", "gemma3:4b", "llama3.2:latest"]);

    const outra = alinhar(depois, [...depois.vistos, "phi4:14b"]);
    expect(outra.ativos).toEqual(["qwen3.5:9b", "phi4:14b"]);
  });

  it("o modelo padrão nunca cai num embedding, mesmo ligado à mão", () => {

    const depois = alinhar(
      listas({ ativos: ["llama3.2", "nomic-embed-text:latest"], modelo: "llama3.2" }),
      ["nomic-embed-text:latest", "qwen3.5:9b"]
    );
    expect(depois.ativos).toEqual(["nomic-embed-text:latest", "qwen3.5:9b"]);
    expect(depois.modelo).toBe("qwen3.5:9b");

    const soEmbedding = alinhar(
      listas({ ativos: ["nomic-embed-text:latest"], modelo: "llama3.2" }),
      ["nomic-embed-text:latest"]
    );
    expect(soEmbedding.modelo).toBe("");
  });

  it("lista vazia com tudo já visto: a busca liga os que conversam (vazia só daria o aviso)", () => {
    const depois = alinhar(
      listas({ ativos: [], vistos: ["qwen3.5:9b", "nomic-embed-text:latest"] }),
      ["qwen3.5:9b", "nomic-embed-text:latest"]
    );
    expect(depois.ativos).toEqual(["qwen3.5:9b"]);
    expect(depois.modelo).toBe("qwen3.5:9b");
  });

  it("o que saiu com ollama rm sai de tudo; o padrão cai no primeiro que sobrou", () => {
    const antes = listas({
      ativos: ["gemma3:4b", "qwen3.5:9b"],
      favoritos: ["gemma3:4b"],
      modelo: "gemma3:4b",
      vistos: ["gemma3:4b", "qwen3.5:9b"],
    });
    const depois = alinhar(antes, ["qwen3.5:9b"]);
    expect(depois).toEqual({ ativos: ["qwen3.5:9b"], favoritos: [], modelo: "qwen3.5:9b", vistos: ["qwen3.5:9b"] });
  });

  it("Ollama sem nenhum modelo: tudo vazio (e não os palpites)", () => {
    const depois = alinhar(listas({ ativos: FABRICA_ATE_0923.ativos, modelo: "llama3.2" }), []);
    expect(depois).toEqual({ ativos: [], favoritos: [], modelo: "", vistos: [] });
  });

  it("já alinhado não muda nada (a gravação depende disso)", () => {
    const certo = listas({ ativos: ["qwen3.5:9b"], modelo: "qwen3.5:9b", vistos: ["qwen3.5:9b"] });
    expect(alinhar(certo, ["qwen3.5:9b"])).toEqual(certo);
  });

  it("nome repetido em duas grafias não vira dois itens", () => {
    const depois = alinhar(listas({ ativos: ["llama3.2", "llama3.2:latest"] }), ["llama3.2:latest"]);
    expect(depois.ativos).toEqual(["llama3.2"]);
  });
});

describe("a lista que ninguém escolheu", () => {
  it("vazia ou os palpites de fábrica (em qualquer ordem) — e só isso", () => {
    expect(listaDeFabrica([])).toBe(true);
    expect(listaDeFabrica([...FABRICA_ATE_0923.ativos].reverse())).toBe(true);
    expect(listaDeFabrica(["qwen3.5:9b"])).toBe(false);
    expect(listaDeFabrica([...FABRICA_ATE_0923.ativos, "qwen3.5:9b"])).toBe(false);
    expect(listaDeFabrica(FABRICA_ATE_0923.ativos.slice(0, 3))).toBe(false);
  });
});

describe("warns when no model is selected", () => {
  it("notice exists in the engine dictionary", () => {
    expect(getTranslations("en-us").ai.err.noModel("Ollama")).toMatch(/Fetch models/);
  });
});

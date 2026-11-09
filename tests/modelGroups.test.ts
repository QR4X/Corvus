import { describe, it, expect } from "vitest";
import { filterModels, groupModels, mergeModelOptions } from "../src/ui/modelGroups";

describe("groupModels", () => {
  it("põe junto o que é da mesma natureza, e conversa vem primeiro", () => {
    const g = groupModels("openai", [
      "gpt-image-1",
      "gpt-4o",
      "o3",
      "tts-1",
      "gpt-5",
    ]);
    expect(g[0].label).toBe("Chat");
    expect(g[0].models).toEqual(["gpt-4o", "gpt-5"]);
    const rotulos = g.map((x) => x.label);
    expect(rotulos).toContain("Reasoning");
    expect(rotulos).toContain("Image");
    expect(rotulos).toContain("Voice");

    expect(rotulos.indexOf("Chat")).toBe(0);
  });

  it("TODO grupo tem nome — eles são abas, e aba sem nome não existe", () => {
    const g = groupModels("openai", ["gpt-4o", "o1", "dall-e-3"]);
    for (const x of g) expect(x.label.length).toBeGreaterThan(0);
  });

  it("não perde NENHUM modelo pelo caminho", () => {

    const entrada = [
      "gpt-4o",
      "o1",
      "dall-e-3",
      "tts-1-hd",
      "text-embedding-3-small",
      "modelo-que-ninguem-conhece",
    ];
    const saida = groupModels("openai", entrada).flatMap((g) => g.models);
    expect(saida.slice().sort()).toEqual(entrada.slice().sort());
  });

  it("preserva a ordem de dentro de cada grupo", () => {

    const g = groupModels("openai", ["gpt-5", "gpt-4o", "gpt-4o-mini"]);
    expect(g[0].models).toEqual(["gpt-5", "gpt-4o", "gpt-4o-mini"]);
  });

  it("com um grupo só, ele continua nomeado — quem some é a barra de abas", () => {
    const g = groupModels("openai", ["gpt-4o", "gpt-5"]);
    expect(g).toHaveLength(1);
    expect(g[0].label).toBe("Chat");
  });

  it("lista vazia não vira grupo vazio", () => {
    expect(groupModels("openai", [])).toEqual([]);
  });
});

describe("filterModels", () => {
  const pretty = (m: string) =>
    m.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const lista = ["gpt-5.4", "gpt-4o-mini", "o3", "dall-e-3"];

  it("acha pelo id", () => {
    expect(filterModels(lista, "4o", pretty)).toEqual(["gpt-4o-mini"]);
  });

  it("acha pelo NOME que está na tela", () => {

    expect(filterModels(lista, "gpt 5", pretty)).toEqual(["gpt-5.4"]);
  });

  it("ignora caixa e espaço em volta", () => {
    expect(filterModels(lista, "  DALL  ", pretty)).toEqual(["dall-e-3"]);
  });

  it("busca vazia devolve tudo, e uma CÓPIA", () => {
    const r = filterModels(lista, "   ", pretty);
    expect(r).toEqual(lista);
    expect(r).not.toBe(lista);
  });

  it("sem resultado é lista vazia, não a lista inteira", () => {
    expect(filterModels(lista, "zzz", pretty)).toEqual([]);
  });
});

describe("mergeModelOptions", () => {
  it("põe o catálogo DEPOIS do que está marcado", () => {

    expect(
      mergeModelOptions(["gpt-5", "gpt-4o"], ["gpt-4o", "gpt-5-mini"])
    ).toEqual(["gpt-5", "gpt-4o", "gpt-5-mini"]);
  });

  it("o mesmo modelo não aparece duas vezes (ele está nos dois lados)", () => {
    const r = mergeModelOptions(["a/b"], ["a/b", "c/d"]);
    expect(r).toEqual(["a/b", "c/d"]);
  });

  it("sem busca de catálogo, a lista é exatamente a de antes", () => {
    expect(mergeModelOptions(["gpt-4o", "o3"], [])).toEqual(["gpt-4o", "o3"]);
  });

  it("id vazio no catálogo não vira linha fantasma na folha", () => {
    expect(mergeModelOptions([], ["", "gpt-4o"])).toEqual(["gpt-4o"]);
  });
});

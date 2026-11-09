import { describe, it, expect } from "vitest";
import { previewFromMarkdown } from "../src/core/chatPreview";

const arquivo = (corpo: string) =>
  `---\nid: x\ntitle: T\n---\n\n# T\n\n${corpo}`;

describe("previewFromMarkdown", () => {
  it("mostra a ÚLTIMA fala, não a primeira", () => {
    const md = arquivo(
      "## You\n\nprimeira\n\n## Assistant\n\nsegunda\n\n## You\n\nterceira\n"
    );
    expect(previewFromMarkdown(md)).toBe("terceira");
  });

  it("os comentários do formato não vazam pro cartão", () => {

    const md = arquivo(
      "## Assistant\n\n<!-- corvus: ts=1 -->\nmovi 3 notas\n\n<!-- corvus-steps: eyJhIjoxfQ== -->\n"
    );
    expect(previewFromMarkdown(md)).toBe("movi 3 notas");
  });

  it("vira UMA linha — o cartão tem duas e elas são do CSS", () => {
    const md = arquivo("## Assistant\n\nlinha um\nlinha dois\n\nlinha três\n");
    expect(previewFromMarkdown(md)).toBe("linha um linha dois linha três");
  });

  it("marcas de markdown saem; o texto fica", () => {
    const md = arquivo(
      "## Assistant\n\n## Plano\n\n- primeiro\n- segundo\n\n```ts\nconst a = 1;\n```\n"
    );
    expect(previewFromMarkdown(md)).toBe("Plano primeiro segundo const a = 1;");
  });

  it("negrito, itálico e companhia saem; o texto fica (achado no cartão do Agent)", () => {
    const md = arquivo(
      "## Assistant\n\nYour Lisbon trip note has been moved and is now at **Travel/Lisbon trip.md**. " +
        "It was *old*, _really_ ~~gone~~ ==here==, __done__.\n"
    );
    expect(previewFromMarkdown(md)).toBe(
      "Your Lisbon trip note has been moved and is now at Travel/Lisbon trip.md. " +
        "It was old, really gone here, done."
    );
  });

  it("o que parece ênfase mas não é fica como está", () => {
    const md = arquivo(
      "## Assistant\n\nsnake_case_name, 2 * 3 * 4, a_b e `a*b*c` e \\*literal\\*\n"
    );
    expect(previewFromMarkdown(md)).toBe("snake_case_name, 2 * 3 * 4, a_b e a*b*c e *literal*");
  });

  it("wikilink mostra o nome (ou o apelido), e embed some", () => {
    const md = arquivo(
      "## Assistant\n\nveja [[Lisbon]], [[Trips/Lisbon|a viagem]] e [[Lisbon#Hotel]] ![[mapa.png]]\n"
    );
    expect(previewFromMarkdown(md)).toBe("veja Lisbon, a viagem e Lisbon > Hotel");
  });

  it("tag de HTML sai, mas comparação com < e > fica", () => {
    const md = arquivo("## Assistant\n\nlinha<br>outra, e 1 < 2 > 0\n");
    expect(previewFromMarkdown(md)).toBe("linha outra, e 1 < 2 > 0");
  });

  it("link mostra o texto, imagem não mostra nada", () => {
    const md = arquivo("## Assistant\n\nveja [o plano](x.md) ![](y.png)\n");
    expect(previewFromMarkdown(md)).toBe("veja o plano");
  });

  it("última fala vazia? pega a anterior que tenha texto", () => {

    const md = arquifoVazio();
    expect(previewFromMarkdown(md)).toBe("pergunta");
  });

  it("conversa sem nenhuma fala devolve vazio", () => {
    expect(previewFromMarkdown(arquifoSoCabecalho())).toBe("");
    expect(previewFromMarkdown("")).toBe("");
  });
});

function arquifoVazio() {
  return arquivo("## You\n\npergunta\n\n## Assistant\n\n<!-- corvus: ts=2 -->\n");
}

function arquifoSoCabecalho() {
  return arquivo("");
}

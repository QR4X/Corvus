import { describe, it, expect } from "vitest";
import { ladoDaEscolha, posicaoDoBalao, type Caixa } from "../src/ui/menu";

// Esta conta já nasceu errada duas vezes, sempre pelo mesmo motivo: ela mistura
// DOIS retângulos. As coordenadas de saída são da camada, que é `absolute`
// dentro da `.corvus-root`; mas quem decide se o balão CABE é a tela. No celular
// a folha vira `fixed` e vai até o fundo do viewport — mais baixo do que a raiz
// alcança —, então um ⋯ na parte de baixo da folha está numa altura que a raiz
// nem tem. Medindo pela raiz, o balão "cabia" na conta e nascia fora da tela.

const caixa = (
  left: number,
  top: number,
  width: number,
  height: number
): Caixa => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

/** O caso do celular: raiz de 770 dentro de uma tela de 900. */
const RAIZ = caixa(0, 0, 400, 770);
const TELA = { width: 400, height: 900 };
const BALAO = { width: 160, height: 273 };

describe("posicaoDoBalao", () => {
  it("abre ABAIXO do botão quando cabe", () => {
    const r = posicaoDoBalao({
      ancora: { left: 360, right: 390, top: 100, bottom: 130 },
      raiz: RAIZ,
      tela: TELA,
      balao: BALAO,
    });
    expect(r.y).toBe(136); // 130 + 6 de vão
    expect(r.origem).toBe("top right");
  });

  it("alinha pela DIREITA do botão", () => {
    const r = posicaoDoBalao({
      ancora: { left: 360, right: 390, top: 100, bottom: 130 },
      raiz: RAIZ,
      tela: TELA,
      balao: BALAO,
    });
    expect(r.x).toBe(390 - 160);
  });

  it("sobe quando não cabe embaixo", () => {
    const r = posicaoDoBalao({
      ancora: { left: 360, right: 390, top: 800, bottom: 830 },
      raiz: RAIZ,
      tela: TELA,
      balao: BALAO,
    });
    expect(r.y + BALAO.height).toBeLessThanOrEqual(TELA.height);
    expect(r.origem).toBe("bottom right");
  });

  it("um botão ABAIXO da raiz ainda nasce dentro da tela", () => {
    // É o caso que quebrou: a folha é `fixed` e vai até 900, a raiz para em
    // 770, e o ⋯ está em 860. Pela raiz, a conta dizia que estava tudo bem.
    const r = posicaoDoBalao({
      ancora: { left: 360, right: 390, top: 845, bottom: 873 },
      raiz: RAIZ,
      tela: TELA,
      balao: BALAO,
    });
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + BALAO.height).toBeLessThanOrEqual(TELA.height);
  });

  it("nunca passa da borda de baixo da TELA, em qualquer altura do botão", () => {
    for (let t = 0; t <= 880; t += 20) {
      const r = posicaoDoBalao({
        ancora: { left: 360, right: 390, top: t, bottom: t + 28 },
        raiz: RAIZ,
        tela: TELA,
        balao: BALAO,
      });
      expect(r.y, `botão em ${t}`).toBeGreaterThanOrEqual(0);
      expect(r.y + BALAO.height, `botão em ${t}`).toBeLessThanOrEqual(
        TELA.height
      );
    }
  });

  it("balão mais alto que a tela encosta no topo", () => {
    // Não cabe de jeito nenhum; o começo da lista é o que mais importa ver.
    const r = posicaoDoBalao({
      ancora: { left: 360, right: 390, top: 400, bottom: 430 },
      raiz: RAIZ,
      tela: { width: 400, height: 200 },
      balao: { width: 160, height: 500 },
    });
    expect(r.y).toBe(10);
  });

  it("não encosta na borda esquerda quando o botão é estreito e à esquerda", () => {
    const r = posicaoDoBalao({
      ancora: { left: 0, right: 30, top: 100, bottom: 130 },
      raiz: RAIZ,
      tela: TELA,
      balao: BALAO,
    });
    expect(r.x).toBe(10);
  });

  it("raiz que cabe inteira na tela se comporta como antes", () => {
    // A mudança não pode mexer no caso comum (desktop, painel lateral).
    const raiz = caixa(0, 0, 400, 600);
    const r = posicaoDoBalao({
      ancora: { left: 360, right: 390, top: 100, bottom: 130 },
      raiz,
      tela: { width: 400, height: 600 },
      balao: BALAO,
    });
    expect(r).toEqual({ x: 230, y: 136, origem: "top right" });
  });
});

describe("ladoDaEscolha (os menus das settings)", () => {
  // A lista sai de DENTRO do botão: mesma largura, colada nele (sem vão),
  // como se o botão fosse a primeira linha dela. Daqui saem o lado e o teto;
  // a borda do encontro o menu.ts prende na do botão.
  const TELA = 900; // o celular de 412×900

  it("cabendo embaixo: desce, com teto no fim da tela", () => {
    expect(ladoDaEscolha({ ancora: { top: 300, bottom: 344 }, alturaDaTela: TELA, altura: 200 })).toEqual({
      sentido: "baixo",
      maxHeight: 546, // 900 − 10 de margem − 344
    });
  });

  it("cabendo embaixo, desce mesmo com mais espaço em cima", () => {
    const r = ladoDaEscolha({ ancora: { top: 600, bottom: 644 }, alturaDaTela: TELA, altura: 200 });
    expect(r.sentido).toBe("baixo"); // 246 embaixo bastam; em cima há 590
  });

  it("sem espaço embaixo e mais em cima: sobe, com teto no topo da tela", () => {
    const r = ladoDaEscolha({ ancora: { top: 700, bottom: 744 }, alturaDaTela: TELA, altura: 494 });
    expect(r).toEqual({ sentido: "cima", maxHeight: 690 });
  });

  it("não cabe em lado nenhum: vai pro maior e rola por dentro", () => {
    const r = ladoDaEscolha({ ancora: { top: 430, bottom: 474 }, alturaDaTela: TELA, altura: 2000 });
    expect(r).toEqual({ sentido: "cima", maxHeight: 420 }); // 420 em cima > 416 embaixo
  });

  it("caixa com fração de pixel (celular): o teto nunca passa do espaço", () => {
    const r = ladoDaEscolha({ ancora: { top: 798.6, bottom: 842.6 }, alturaDaTela: TELA, altura: 485 });
    expect(r.sentido).toBe("cima");
    expect(r.maxHeight).toBe(788); // floor(798.6 − 10): pra cima, passaria da margem
  });
});

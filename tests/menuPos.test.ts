import { describe, it, expect } from "vitest";
import { pickSide, popoverPosition, type Box } from "../src/ui/menu";

const caixa = (
  left: number,
  top: number,
  width: number,
  height: number
): Box => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const RAIZ = caixa(0, 0, 400, 770);
const TELA = { width: 400, height: 900 };
const BALAO = { width: 160, height: 273 };

describe("posicaoDoBalao", () => {
  it("abre ABAIXO do botão quando cabe", () => {
    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 100, bottom: 130 },
      root: RAIZ,
      viewport: TELA,
      popover: BALAO,
    });
    expect(r.y).toBe(136); 
    expect(r.origin).toBe("top right");
  });

  it("alinha pela DIREITA do botão", () => {
    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 100, bottom: 130 },
      root: RAIZ,
      viewport: TELA,
      popover: BALAO,
    });
    expect(r.x).toBe(390 - 160);
  });

  it("sobe quando não cabe embaixo", () => {
    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 800, bottom: 830 },
      root: RAIZ,
      viewport: TELA,
      popover: BALAO,
    });
    expect(r.y + BALAO.height).toBeLessThanOrEqual(TELA.height);
    expect(r.origin).toBe("bottom right");
  });

  it("um botão ABAIXO da raiz ainda nasce dentro da tela", () => {

    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 845, bottom: 873 },
      root: RAIZ,
      viewport: TELA,
      popover: BALAO,
    });
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + BALAO.height).toBeLessThanOrEqual(TELA.height);
  });

  it("nunca passa da borda de baixo da TELA, em qualquer altura do botão", () => {
    for (let t = 0; t <= 880; t += 20) {
      const r = popoverPosition({
        anchor: { left: 360, right: 390, top: t, bottom: t + 28 },
        root: RAIZ,
        viewport: TELA,
        popover: BALAO,
      });
      expect(r.y, `botão em ${t}`).toBeGreaterThanOrEqual(0);
      expect(r.y + BALAO.height, `botão em ${t}`).toBeLessThanOrEqual(
        TELA.height
      );
    }
  });

  it("balão mais alto que a tela encosta no topo", () => {

    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 400, bottom: 430 },
      root: RAIZ,
      viewport: { width: 400, height: 200 },
      popover: { width: 160, height: 500 },
    });
    expect(r.y).toBe(10);
  });

  it("não encosta na borda esquerda quando o botão é estreito e à esquerda", () => {
    const r = popoverPosition({
      anchor: { left: 0, right: 30, top: 100, bottom: 130 },
      root: RAIZ,
      viewport: TELA,
      popover: BALAO,
    });
    expect(r.x).toBe(10);
  });

  it("raiz que cabe inteira na tela se comporta como antes", () => {

    const raiz = caixa(0, 0, 400, 600);
    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 100, bottom: 130 },
      root: raiz,
      viewport: { width: 400, height: 600 },
      popover: BALAO,
    });
    expect(r).toEqual({ x: 230, y: 136, origin: "top right" });
  });
});

describe("ladoDaEscolha (os menus das settings)", () => {

  const TELA = 900; 

  it("cabendo embaixo: desce, com teto no fim da tela", () => {
    expect(pickSide({ anchor: { top: 300, bottom: 344 }, viewportHeight: TELA, popoverHeight: 200 })).toEqual({
      direction: "down",
      maxHeight: 546, 
    });
  });

  it("cabendo embaixo, desce mesmo com mais espaço em cima", () => {
    const r = pickSide({ anchor: { top: 600, bottom: 644 }, viewportHeight: TELA, popoverHeight: 200 });
    expect(r.direction).toBe("down"); 
  });

  it("sem espaço embaixo e mais em cima: sobe, com teto no topo da tela", () => {
    const r = pickSide({ anchor: { top: 700, bottom: 744 }, viewportHeight: TELA, popoverHeight: 494 });
    expect(r).toEqual({ direction: "up", maxHeight: 690 });
  });

  it("não cabe em lado nenhum: vai pro maior e rola por dentro", () => {
    const r = pickSide({ anchor: { top: 430, bottom: 474 }, viewportHeight: TELA, popoverHeight: 2000 });
    expect(r).toEqual({ direction: "up", maxHeight: 420 }); 
  });

  it("caixa com fração de pixel (celular): o teto nunca passa do espaço", () => {
    const r = pickSide({ anchor: { top: 798.6, bottom: 842.6 }, viewportHeight: TELA, popoverHeight: 485 });
    expect(r.direction).toBe("up");
    expect(r.maxHeight).toBe(788); 
  });
});

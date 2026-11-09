import { describe, it, expect } from "vitest";
import {
  FOLLOW_SLACK,
  distanceFromBottom,
  shouldFollow,
  shouldShowJump,
  wasAtBottom,
  decideScroll,
} from "../src/ui/follow";

const el = (scrollTop: number, scrollHeight = 2000, clientHeight = 600) => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});

describe("distanceFromBottom", () => {
  it("colado no fim é zero", () => {
    expect(distanceFromBottom(el(1400))).toBe(0);
  });

  it("mede o que falta", () => {
    expect(distanceFromBottom(el(1000))).toBe(400);
  });

  it("overscroll (scrollTop além do fim) não vira negativo", () => {
    expect(distanceFromBottom(el(1600))).toBe(0);
  });
});

describe("shouldFollow", () => {
  it("no fim: segue", () => {
    expect(shouldFollow(el(1400))).toBe(true);
  });

  it("dentro da folga ainda segue — o dedo nunca para no pixel exato", () => {
    expect(shouldFollow(el(1400 - FOLLOW_SLACK + 1))).toBe(true);
  });

  it("um pixel além da folga: solta", () => {
    expect(shouldFollow(el(1400 - FOLLOW_SLACK - 1))).toBe(false);
  });

  it("subiu pra reler: solta", () => {
    expect(shouldFollow(el(200))).toBe(false);
  });

  it("conversa que cabe na tela está sempre no fim", () => {
    expect(shouldFollow(el(0, 500, 600))).toBe(true);
  });

  it("depois da NOSSA rolagem continua seguindo (é isso que evita o falso solto)", () => {
    const depois = el(2000 - 600); 
    expect(shouldFollow(depois)).toBe(true);
  });
});

describe("shouldShowJump", () => {
  it("seguindo não mostra nada, nem respondendo", () => {
    expect(shouldShowJump(true, true, false)).toBe(false);
    expect(shouldShowJump(true, false, true)).toBe(false);
  });

  it("longe e respondendo: mostra o caminho de volta", () => {
    expect(shouldShowJump(false, true, false)).toBe(true);
  });

  it("longe e terminou: mostra que ficou pronta", () => {
    expect(shouldShowJump(false, false, true)).toBe(true);
  });

  it("longe, parado e sem novidade: não incomoda", () => {
    expect(shouldShowJump(false, false, false)).toBe(false);
  });
});

describe("wasAtBottom", () => {
  const ALTURA = 2000;
  const VISIVEL = 600;
  const NO_FIM = ALTURA - VISIVEL; 

  it("estava colado: segue", () => {
    expect(wasAtBottom(ALTURA, NO_FIM, VISIVEL)).toBe(true);
  });

  it("estava colado e chegaram 400px de texto: CONTINUA seguindo", () => {

    expect(wasAtBottom(ALTURA, NO_FIM, VISIVEL)).toBe(true);

    expect(shouldFollow({ scrollTop: NO_FIM, scrollHeight: 2400, clientHeight: VISIVEL })).toBe(false);
  });

  it("tinha subido pra reler: não segue, mesmo com texto novo chegando", () => {
    expect(wasAtBottom(ALTURA, 300, VISIVEL)).toBe(false);
  });

  it("dentro da folga conta como fim", () => {
    expect(wasAtBottom(ALTURA, NO_FIM - FOLLOW_SLACK, VISIVEL)).toBe(true);
    expect(wasAtBottom(ALTURA, NO_FIM - FOLLOW_SLACK - 1, VISIVEL)).toBe(false);
  });

  it("primeira medida (altura anterior 0) não trava a tela", () => {

    expect(wasAtBottom(0, 0, VISIVEL)).toBe(true);
  });

  it("conversa menor que a tela conta como fim", () => {
    expect(wasAtBottom(400, 0, 600)).toBe(true);
  });
});

describe("decideScroll — o dedo manda", () => {
  const CH = 600;

  it("sem gesto, estava no fim: desce e segue", () => {
    expect(
      decideScroll({ gesto: false, alturaAnterior: 2000, alturaAtual: 2400, scrollTop: 1400, clientHeight: CH })
    ).toEqual({ pin: true, seguindo: true });
  });

  it("COM gesto, mesmo no fim: NÃO desce (o dedo está trabalhando)", () => {
    expect(
      decideScroll({ gesto: true, alturaAnterior: 2000, alturaAtual: 2400, scrollTop: 1800, clientHeight: CH })
    ).toEqual({ pin: false, seguindo: true });
  });

  it("arrasto curto durante o gesto solta assim que passa a folga", () => {

    const perto = decideScroll({ gesto: true, alturaAnterior: 2000, alturaAtual: 2400, scrollTop: 1760, clientHeight: CH });
    const longe = decideScroll({ gesto: true, alturaAnterior: 2000, alturaAtual: 2400, scrollTop: 1700, clientHeight: CH });
    expect(perto.seguindo).toBe(true);
    expect(longe.seguindo).toBe(false);

    expect(perto.pin).toBe(false);
    expect(longe.pin).toBe(false);
  });

  it("oito passos de 35px acumulam em vez de voltar pro fim", () => {
    let scrollTop = 1400; 
    let alturaAnterior = 2000;
    let alturaAtual = 2000;
    for (let i = 0; i < 8; i++) {
      scrollTop -= 35;
      alturaAtual += 60; 
      const { pin } = decideScroll({ gesto: true, alturaAnterior, alturaAtual, scrollTop, clientHeight: CH });

      expect(pin).toBe(false);
      alturaAnterior = alturaAtual;
    }
    expect(scrollTop).toBe(1400 - 280);
  });

  it("soltando o dedo perto do fim, volta a seguir", () => {
    const r = decideScroll({ gesto: false, alturaAnterior: 2400, alturaAtual: 2400, scrollTop: 1760, clientHeight: CH });
    expect(r).toEqual({ pin: true, seguindo: true });
  });

  it("soltando o dedo longe, fica onde está", () => {
    const r = decideScroll({ gesto: false, alturaAnterior: 2400, alturaAtual: 2400, scrollTop: 900, clientHeight: CH });
    expect(r).toEqual({ pin: false, seguindo: false });
  });
});

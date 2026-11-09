import { describe, it, expect } from "vitest";

import { fullscreenOn, isChatScreen, isDrawerOnScreen, isRightDrawer } from "../src/ui/fullscreenScope";

/** Fake mínimo de Element pro classList que o helper consulta. */
const drawerEl = (...classes: string[]) =>
  ({ classList: { contains: (c: string) => classes.includes(c) } }) as Element;

const rect = (left: number, width: number, height = 800) => ({
  left,
  width,
  height,
  right: left + width,
});

describe("isRightDrawer — fullscreen NÃO pode valer no drawer esquerdo", () => {
  it("mod-right liga", () => {
    expect(isRightDrawer(drawerEl("workspace-drawer", "mod-right"))).toBe(true);
  });

  it("mod-left NUNCA liga", () => {
    expect(isRightDrawer(drawerEl("workspace-drawer", "mod-left"))).toBe(false);
  });

  it("sem marca de lado, não trava o modo (a Corvus só monta no direito)", () => {
    expect(isRightDrawer(drawerEl("workspace-drawer"))).toBe(true);
  });

  it("sem drawer não há fullscreen", () => {
    expect(isRightDrawer(null)).toBe(false);
  });
});

describe("isDrawerOnScreen — quando a navbar global pode sumir", () => {
  const VW = 400;

  it("gaveta ocupando a tela inteira conta como aberta", () => {
    expect(isDrawerOnScreen(rect(0, 400), VW)).toBe(true);
  });

  it("gaveta transladada pra fora (fechada no swipe) não conta", () => {
    expect(isDrawerOnScreen(rect(400, 400), VW)).toBe(false);
    expect(isDrawerOnScreen(rect(-400, 400), VW)).toBe(false);
  });

  it("no meio da animação de sair (só 40% visível) já não conta", () => {
    expect(isDrawerOnScreen(rect(240, 400), VW)).toBe(false);
  });

  it("60% visível ainda conta — evita piscar a navbar durante a abertura", () => {
    expect(isDrawerOnScreen(rect(160, 400), VW)).toBe(true);
  });

  it("caixa zerada (display:none / sem layout) não conta", () => {
    expect(isDrawerOnScreen(rect(0, 0), VW)).toBe(false);
    expect(isDrawerOnScreen(rect(0, 400, 0), VW)).toBe(false);
  });

  it("gaveta parcial do modo NÃO-fullscreen (85% da tela) conta como aberta", () => {
    expect(isDrawerOnScreen(rect(60, 340), VW)).toBe(true);
  });
});

describe("fullscreenOn — a conversa liga o modo SEM tocar na setting", () => {
  it("setting desligada + conversa aberta → LIGA", () => {
    expect(fullscreenOn(false, true)).toBe(true);
  });

  it("setting ligada → vale em qualquer tela", () => {
    expect(fullscreenOn(true, false)).toBe(true);
    expect(fullscreenOn(true, true)).toBe(true);
  });

  it("desligada e fora da conversa → DESLIGA (nada foi gravado)", () => {
    expect(fullscreenOn(false, false)).toBe(false);
  });
});

describe("isChatScreen — a marca da conversa vem do DOM", () => {
  const rootEl = (...classes: string[]) =>
    ({ classList: { contains: (c: string) => classes.includes(c) } }) as Element;

  it("com a marca `corvus-chat-open`, é conversa", () => {
    expect(isChatScreen(rootEl("corvus-root", "corvus-chat-open"))).toBe(true);
  });

  it("sem a marca (painel, histórico, uso) não é conversa", () => {
    expect(isChatScreen(rootEl("corvus-root"))).toBe(false);
  });

  it("sem root não é conversa", () => {
    expect(isChatScreen(null)).toBe(false);
  });
});

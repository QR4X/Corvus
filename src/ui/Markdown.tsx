// src/ui/Markdown.tsx
// Renderiza markdown com o renderer NATIVO do Obsidian (wikilinks, callouts,
// code, mermaid…) — INCLUSIVE enquanto a mensagem está chegando.
//
// Antes o streaming mostrava texto cru e só formatava no fim, pra fugir de dois
// problemas reais: custo (re-parsear a cada token) e piscada (esvaziar o nó
// antes de cada render). Os dois têm solução, e nenhuma delas é desistir da
// formatação:
//
//   custo   → no máximo um render a cada THROTTLE_MS, com o texto mais novo
//             no momento em que ele acontece (não uma fila deles).
//   piscada → o markdown é montado num nó SOLTO e só então troca o conteúdo
//             visível de uma vez. O usuário nunca vê o vazio do meio.

import { useCallback, useEffect, useRef } from "react";
import { App, Component, Keymap, MarkdownRenderer, Platform, type HoverParent } from "obsidian";
import {
  abrirLinkDaResposta,
  linkInterno,
  previaDoLink,
  textoDoLink,
} from "./linksDaResposta";

/** Teto de renders por segundo enquanto o texto chega. */
const THROTTLE_MS = 140;

export function Markdown({
  app,
  text,
  streaming,
}: {
  app: App;
  text: string;
  streaming?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const compRef = useRef<Component | null>(null);
  const timerRef = useRef<number | null>(null);
  /** Texto mais novo — o timer lê daqui, não do fecho em que foi criado. */
  const textRef = useRef(text);
  textRef.current = text;
  /** O que já está na tela: evita re-render de texto que não mudou. */
  const shownRef = useRef<string | null>(null);
  /** Dono da prévia de nota aberta pelo hover (o Obsidian guarda ela aqui). */
  const hoverRef = useRef<HoverParent>({ hoverPopover: null });

  const render = useCallback(
    async (md: string) => {
      const el = ref.current;
      if (!el) return;
      shownRef.current = md;
      compRef.current?.unload();
      const comp = new Component();
      comp.load();
      compRef.current = comp;
      // Monta FORA da tela e troca pronto: sem o quadro vazio do meio.
      // No documento do PRÓPRIO destino: numa janela destacada, um nó criado
      // na janela principal entra como estrangeiro.
      //
      // `el.win.createDiv()`: o `win` do nó é a janela DELE, e o `createDiv`
      // dessa janela cria um div SEM pai, no documento dela. Os helpers vêm do
      // enhance.js do Obsidian, que define `window.createDiv` e é reavaliado
      // DENTRO de cada janela nova (a de popout inclusive) — por isso a busca
      // no app.js não os achava: moram noutro arquivo. (A 0.9.9 errou nisso.)
      // O cast é porque a tipagem declara `createDiv` como função global, e
      // `Window` não traz o membro; `typeof window` traz.
      const tmp = (el.win as typeof window).createDiv();
      await MarkdownRenderer.render(app, md, tmp, "", comp);
      if (ref.current !== el || shownRef.current !== md) return;
      el.replaceChildren(...Array.from(tmp.childNodes));
    },
    [app]
  );

  useEffect(() => {
    if (!streaming) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (shownRef.current !== text) void render(text);
      return;
    }
    // Já tem um render agendado: ele vai pegar o texto mais novo sozinho.
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void render(textRef.current);
    }, THROTTLE_MS);
  }, [text, streaming, render]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      compRef.current?.unload();
    },
    []
  );

  // Os [[links]] da resposta abrem a nota (linksDaResposta.ts). Um ouvinte só,
  // no contêiner: o conteúdo é trocado a cada render e o contêiner fica.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const abrir = (e: MouseEvent) => {
      const a = linkInterno(e.target, el);
      if (!a) return;
      // O botão do meio chega no auxclick; o direito fica com o menu.
      if (e.type === "auxclick" && e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      abrirLinkDaResposta(app, textoDoLink(a), Keymap.isModEvent(e), el);
    };
    const previa = (e: MouseEvent) => {
      const a = linkInterno(e.target, el);
      // Andar entre os filhos do mesmo link não é entrar nele de novo.
      if (!a || a.contains(e.relatedTarget as Node | null)) return;
      previaDoLink(app, e, a, hoverRef.current);
    };
    el.addEventListener("click", abrir);
    el.addEventListener("auxclick", abrir);
    if (!Platform.isMobile) el.addEventListener("mouseover", previa);
    const pai = hoverRef.current;
    return () => {
      el.removeEventListener("click", abrir);
      el.removeEventListener("auxclick", abrir);
      el.removeEventListener("mouseover", previa);
      pai.hoverPopover?.unload();
    };
  }, [app]);

  return <div ref={ref} className="corvus-markdown" />;
}

import { useCallback, useEffect, useRef } from "react";
import { App, Component, Keymap, MarkdownRenderer, Platform, type HoverParent } from "obsidian";
import {
  abrirLinkDaResposta,
  linkInterno,
  previaDoLink,
  textoDoLink,
} from "./responseLinks";

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

  const textRef = useRef(text);
  textRef.current = text;

  const shownRef = useRef<string | null>(null);

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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const abrir = (e: MouseEvent) => {
      const a = linkInterno(e.target, el);
      if (!a) return;

      if (e.type === "auxclick" && e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      abrirLinkDaResposta(app, textoDoLink(a), Keymap.isModEvent(e), el);
    };
    const previa = (e: MouseEvent) => {
      const a = linkInterno(e.target, el);

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

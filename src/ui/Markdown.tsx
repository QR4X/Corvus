import { useCallback, useEffect, useRef } from "react";
import { App, Component, Keymap, MarkdownRenderer, Platform, type HoverParent } from "obsidian";
import {
  openResponseLink,
  internalLink,
  previewLink,
  linkText,
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
    const openLink = (e: MouseEvent) => {
      const a = internalLink(e.target, el);
      if (!a) return;

      if (e.type === "auxclick" && e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      openResponseLink(app, linkText(a), Keymap.isModEvent(e), el);
    };
    const preview = (e: MouseEvent) => {
      const a = internalLink(e.target, el);

      if (!a || a.contains(e.relatedTarget as Node | null)) return;
      previewLink(app, e, a, hoverRef.current);
    };
    el.addEventListener("click", openLink);
    el.addEventListener("auxclick", openLink);
    if (!Platform.isMobile) el.addEventListener("mouseover", preview);
    const hoverParent = hoverRef.current;
    return () => {
      el.removeEventListener("click", openLink);
      el.removeEventListener("auxclick", openLink);
      el.removeEventListener("mouseover", preview);
      hoverParent.hoverPopover?.unload();
    };
  }, [app]);

  return <div ref={ref} className="corvus-markdown" />;
}

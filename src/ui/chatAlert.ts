import { mark } from "../i18n/tr";

export type ChatAlert = "waiting" | "running" | "unread" | null;

export function chatAlert(p: {

  esperando: boolean;

  rodando: boolean;

  naoLida: boolean;
}): ChatAlert {
  if (p.esperando) return "waiting";
  if (p.rodando) return "running";
  if (p.naoLida) return "unread";
  return null;
}

export const ALERT_LABEL: Record<Exclude<ChatAlert, null>, string> = {
  waiting: mark("Needs you"),
  running: mark("Responding"),
  unread: mark("New reply"),
};

export function alertCount(
  chats: ReadonlyArray<{ id: string; mode: string }>,
  mode: string,
  p: { esperando: string | null; naoLidas: ReadonlySet<string> }
): number {
  let n = 0;
  for (const c of chats) {
    if (c.mode !== mode) continue;
    if (c.id === p.esperando || p.naoLidas.has(c.id)) n += 1;
  }
  return n;
}

import { mark } from "../i18n/tr";

type ChatAlert = "waiting" | "running" | "unread" | null;

export function chatAlert(p: {

  waiting: boolean;

  running: boolean;

  unread: boolean;
}): ChatAlert {
  if (p.waiting) return "waiting";
  if (p.running) return "running";
  if (p.unread) return "unread";
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
  p: { waitingId: string | null; unread: ReadonlySet<string> }
): number {
  let n = 0;
  for (const c of chats) {
    if (c.mode !== mode) continue;
    if (c.id === p.waitingId || p.unread.has(c.id)) n += 1;
  }
  return n;
}

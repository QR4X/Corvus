import { CHAT_MODES, isChatMode, type ChatMode } from "../core/session";
import type { ChatSummary } from "../core/chatPersistence";
import { mark, tr } from "../i18n/tr";

interface ModuleMeta {

  id: string;

  label: string;

  short: string;
  icon: string;

  tagline: string;

  placeholder: string;

  emptyLine: string;

  fabLabel: string;
}

export const MODULES: Record<ChatMode, ModuleMeta> = {
  chat: {
    id: "chat",
    label: "Chat",
    short: "Chat",
    icon: "message-circle",
    tagline: mark("Just you and the model. Your notes stay out of it."),
    placeholder: mark("Message the model…"),
    emptyLine: mark("Ask anything. Your chats show up here."),
    fabLabel: mark("New chat"),
  },
  "vault-qa": {
    id: "vault-qa",
    label: "Vault Q&A",
    short: "Vault",
    icon: "library",
    tagline: mark("Answers grounded in your notes, found by local search."),
    placeholder: mark("Ask something about your notes…"),
    emptyLine: mark("Ask about your notes. The answers land here."),
    fabLabel: mark("New question"),
  },
  agent: {
    id: "agent",
    label: "Agent",
    short: "Agent",
    icon: "bot",
    tagline: mark("Reads and edits your vault — every change asks first."),
    placeholder: mark("Tell the agent what to do in your vault…"),
    emptyLine: mark("Put the agent to work in your vault. Runs show up here."),
    fabLabel: mark("New session"),
  },
};

export const MODULE_LIST: ModuleMeta[] = CHAT_MODES.map((m) => MODULES[m]);

export function modulesInUse(chats: readonly ChatSummary[]): ModuleMeta[] {
  const extras = new Map<string, ModuleMeta>();
  for (const c of chats) {
    if (!c.mode || isChatMode(c.mode) || extras.has(c.mode)) continue;
    extras.set(c.mode, {
      id: c.mode,
      label: moduleLabel(c.mode),
      short: moduleLabel(c.mode),
      icon: moduleIcon(c.mode),
      tagline: "",
      placeholder: MODULES.chat.placeholder,
      emptyLine: MODULES.chat.emptyLine,
      fabLabel: MODULES.chat.fabLabel,
    });
  }
  return [...MODULE_LIST, ...extras.values()];
}

export function moduleLabel(id: string | undefined | null): string {
  if (isChatMode(id)) return MODULES[id].label;
  return (id ?? "").trim() || "Chat";
}

export function moduleIcon(id: string | undefined | null): string {
  return isChatMode(id) ? MODULES[id].icon : "message-square";
}

export function modulePlaceholder(id: string | undefined | null): string {
  return tr(isChatMode(id) ? MODULES[id].placeholder : MODULES.chat.placeholder);
}

interface ChatSearch {
  hits: ChatSummary[];

  regex: boolean;

  invalid: boolean;
}

export function searchChats(
  chats: readonly ChatSummary[],
  query: string
): ChatSearch {
  const q = query.trim();
  if (!q) return { hits: [...chats], regex: false, invalid: false };

  const untitled = tr("Untitled");
  const haystack = (c: ChatSummary) => `${c.title || untitled} ${c.model}`;
  let re: RegExp | null = null;
  try {
    re = new RegExp(q, "i");
  } catch {
    re = null;
  }
  if (re) {
    const exp = re;
    return { hits: chats.filter((c) => exp.test(haystack(c))), regex: true, invalid: false };
  }
  const literal = q.toLowerCase();
  return {
    hits: chats.filter((c) => haystack(c).toLowerCase().includes(literal)),
    regex: false,
    invalid: true,
  };
}

export function moduleFabLabel(id: string | undefined | null): string {
  return tr(isChatMode(id) ? MODULES[id].fabLabel : MODULES.chat.fabLabel);
}

export function relativeShort(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return tr("now");
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return iso.slice(0, 10);
}

export function moduleEmptyLine(id: string | undefined | null): string {
  if (isChatMode(id)) return tr(MODULES[id].emptyLine);

  return tr("Chats saved here by another version. This one can't start new ones.");
}

export function chatsOfModule(
  chats: readonly ChatSummary[],
  mode: string
): ChatSummary[] {
  return chats.filter((c) => c.mode === mode);
}

interface ModuleStats {
  count: number;

  last?: string;
}

export function moduleStats(
  chats: readonly ChatSummary[],
  mode: string
): ModuleStats {
  const own = chatsOfModule(chats, mode);
  if (own.length === 0) return { count: 0 };

  let last = own[0].date;
  for (const c of own) if (c.date > last) last = c.date;
  return { count: own.length, last };
}

export function relativeDay(iso: string, now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dayIndex = (x: Date) =>
    Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000;
  const diff = dayIndex(new Date(now)) - dayIndex(d);
  if (diff <= 0) return tr("Today");
  if (diff === 1) return tr("Yesterday");
  if (diff < 7) return tr("{n} days ago", { n: diff });
  return iso.slice(0, 10);
}

export const SEGMENT_ALL = "all";

interface ModuleSegment {
  id: string;
  label: string;
  count: number;
}

export function moduleSegments(chats: readonly ChatSummary[]): ModuleSegment[] {
  const segs: ModuleSegment[] = [];
  for (const m of modulesInUse(chats)) {
    const count = chatsOfModule(chats, m.id).length;
    if (count > 0) segs.push({ id: m.id, label: m.short, count });
  }
  return segs;
}

export function defaultSegment(
  chats: readonly ChatSummary[],
  fallback: string | undefined | null
): ChatMode {
  let latest: ChatSummary | null = null;
  for (const c of chats) {
    if (!isChatMode(c.mode)) continue;

    if (!latest || c.date > latest.date) latest = c;
  }
  if (latest && isChatMode(latest.mode)) return latest.mode;
  return isChatMode(fallback) ? fallback : "chat";
}

export function startupMode(value: string | undefined | null): ChatMode | null {
  return isChatMode(value) ? value : null;
}

export const STARTUP_DASHBOARD = "dashboard";

export function startupOpensPanel(value: string | undefined | null): boolean {
  return value === STARTUP_DASHBOARD || isChatMode(value);
}

export function filterSegment(
  chats: readonly ChatSummary[],
  seg: string
): ChatSummary[] {
  return seg === SEGMENT_ALL ? [...chats] : chatsOfModule(chats, seg);
}

export function moduleHint(stats: ModuleStats, now?: number): string {
  if (stats.count === 0) return tr("No chats yet");
  const countLabel =
    stats.count === 1 ? tr("1 chat") : tr("{n} chats", { n: stats.count });
  const when = stats.last ? relativeDay(stats.last, now) : "";
  return when ? `${countLabel} · ${when}` : countLabel;
}

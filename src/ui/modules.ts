import { CHAT_MODES, isChatMode, type ChatMode } from "../core/session";
import type { ChatSummary } from "../core/chatPersistence";
import { mark, tr } from "../i18n/tr";

export interface ModuleMeta {

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

export interface Busca {
  hits: ChatSummary[];

  regex: boolean;

  invalida: boolean;
}

export function searchChats(
  chats: readonly ChatSummary[],
  query: string
): Busca {
  const q = query.trim();
  if (!q) return { hits: [...chats], regex: false, invalida: false };

  const semTitulo = tr("Untitled");
  const alvo = (c: ChatSummary) => `${c.title || semTitulo} ${c.model}`;
  let re: RegExp | null = null;
  try {
    re = new RegExp(q, "i");
  } catch {
    re = null;
  }
  if (re) {
    const exp = re;
    return { hits: chats.filter((c) => exp.test(alvo(c))), regex: true, invalida: false };
  }
  const literal = q.toLowerCase();
  return {
    hits: chats.filter((c) => alvo(c).toLowerCase().includes(literal)),
    regex: false,
    invalida: true,
  };
}

export function moduleFabLabel(id: string | undefined | null): string {
  return tr(isChatMode(id) ? MODULES[id].fabLabel : MODULES.chat.fabLabel);
}

export function relativeShort(iso: string, agora: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((agora - t) / 1000));
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

export interface ModuleStats {
  count: number;

  last?: string;
}

export function moduleStats(
  chats: readonly ChatSummary[],
  mode: string
): ModuleStats {
  const minhas = chatsOfModule(chats, mode);
  if (minhas.length === 0) return { count: 0 };

  let last = minhas[0].date;
  for (const c of minhas) if (c.date > last) last = c.date;
  return { count: minhas.length, last };
}

export function relativeDay(iso: string, agora: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = (x: Date) =>
    Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000;
  const diff = dia(new Date(agora)) - dia(d);
  if (diff <= 0) return tr("Today");
  if (diff === 1) return tr("Yesterday");
  if (diff < 7) return tr("{n} days ago", { n: diff });
  return iso.slice(0, 10);
}

export const SEGMENT_ALL = "all";

export interface ModuleSegment {
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
  padrao: string | undefined | null
): ChatMode {
  let melhor: ChatSummary | null = null;
  for (const c of chats) {
    if (!isChatMode(c.mode)) continue;

    if (!melhor || c.date > melhor.date) melhor = c;
  }
  if (melhor && isChatMode(melhor.mode)) return melhor.mode;
  return isChatMode(padrao) ? padrao : "chat";
}

export function startupMode(valor: string | undefined | null): ChatMode | null {
  return isChatMode(valor) ? valor : null;
}

export const STARTUP_DASHBOARD = "dashboard";

export function startupOpensPanel(valor: string | undefined | null): boolean {
  return valor === STARTUP_DASHBOARD || isChatMode(valor);
}

export function filterSegment(
  chats: readonly ChatSummary[],
  seg: string
): ChatSummary[] {
  return seg === SEGMENT_ALL ? [...chats] : chatsOfModule(chats, seg);
}

export function moduleHint(stats: ModuleStats, agora?: number): string {
  if (stats.count === 0) return tr("No chats yet");
  const quantos =
    stats.count === 1 ? tr("1 chat") : tr("{n} chats", { n: stats.count });
  const quando = stats.last ? relativeDay(stats.last, agora) : "";
  return quando ? `${quantos} · ${quando}` : quantos;
}

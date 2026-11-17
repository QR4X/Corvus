import type { App } from "obsidian";
import type { CorvusSettings } from "../settings";
import { listAllChats, type ChatSummary } from "./chatPersistence";
import { chatIndexSignature } from "./chatIndex";

const INDEX_VERSION = 2;
const INDEX_WRITE_DELAY_MS = 800;

function parseIndex(raw: string): ChatSummary[] | null {
  const parsed = JSON.parse(raw) as { v?: unknown; items?: unknown } | unknown[] | null;
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && parsed.v === INDEX_VERSION
      ? parsed.items
      : null;
  if (!Array.isArray(items)) return null;
  const valid = items.every(
    (it): it is ChatSummary =>
      !!it &&
      typeof it === "object" &&
      typeof (it as ChatSummary).id === "string" &&
      typeof (it as ChatSummary).date === "string"
  );
  if (!valid) return null;
  return items.map((it) => ({ ...it, starred: it.starred === true }));
}

function notifyAll(listeners: Set<() => void>, label: string): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error(`[corvus] ${label} listener failed:`, err);
    }
  });
}

export class ChatLibrary {
  list: ChatSummary[] | null = null;
  private loading: Promise<ChatSummary[]> | null = null;
  private reconciling = false;
  private writeTimer: number | null = null;
  private listeners = new Set<() => void>();
  private unreadListeners = new Set<() => void>();

  constructor(
    private readonly app: App,
    private readonly settings: () => CorvusSettings,
    private readonly save: () => Promise<void>,
    private readonly indexFile: string
  ) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onUnreadChange(cb: () => void): () => void {
    this.unreadListeners.add(cb);
    return () => this.unreadListeners.delete(cb);
  }

  unread(): Set<string> {
    return new Set(this.settings().unreadChats);
  }

  markUnread(id: string): void {
    const s = this.settings();
    if (!id || s.unreadChats.includes(id)) return;
    s.unreadChats = [...s.unreadChats, id];
    void this.save();
    notifyAll(this.unreadListeners, "unread");
  }

  clearUnread(id: string): void {
    const s = this.settings();
    if (!id || !s.unreadChats.includes(id)) return;
    s.unreadChats = s.unreadChats.filter((x) => x !== id);
    void this.save();
    notifyAll(this.unreadListeners, "unread");
  }

  async load(force = false): Promise<ChatSummary[]> {
    if (!force && this.list) return this.list;
    if (!force && this.loading) return this.loading;
    this.loading = (async () => {
      try {
        if (!force) {
          const cached = await this.readIndex();
          if (cached) {
            this.replace(cached, false);
            void this.reconcile();
            return cached;
          }
        }
        const all = await listAllChats(this.app, this.settings().chatsPath, 100_000);
        this.replace(all, true);
        return all;
      } catch (err) {
        console.error("[corvus] loadChatSummaries failed:", err);
        return this.list ?? [];
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  upsert(summary: ChatSummary): void {
    if (!this.list) return;
    this.list = [...this.list.filter((c) => c.id !== summary.id), summary].sort((a, b) =>
      b.date.localeCompare(a.date)
    );
    notifyAll(this.listeners, "chats");
    this.scheduleWrite();
  }

  remove(id: string): void {
    this.clearUnread(id);
    if (!this.list) return;
    this.list = this.list.filter((c) => c.id !== id);
    notifyAll(this.listeners, "chats");
    this.scheduleWrite();
  }

  dispose(): void {
    if (this.writeTimer === null) return;
    window.clearTimeout(this.writeTimer);
    this.writeTimer = null;
  }

  private replace(list: ChatSummary[], persist: boolean): void {
    this.list = list;
    notifyAll(this.listeners, "chats");
    if (persist) void this.writeIndex(list);
  }

  private async reconcile(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const fresh = await listAllChats(this.app, this.settings().chatsPath, 100_000);
      if (!this.list || chatIndexSignature(fresh) !== chatIndexSignature(this.list)) {
        this.replace(fresh, true);
      }
    } catch (err) {
      console.error("[corvus] reconcileChatSummaries failed:", err);
    } finally {
      this.reconciling = false;
    }
  }

  private async readIndex(): Promise<ChatSummary[] | null> {
    try {
      const adapter = this.app.vault.adapter;
      if (!(await adapter.exists(this.indexFile))) return null;
      return parseIndex(await adapter.read(this.indexFile));
    } catch (err) {
      console.error("[corvus] readChatIndex failed:", err);
      return null;
    }
  }

  private async writeIndex(list: ChatSummary[]): Promise<void> {
    this.dispose();
    try {
      await this.app.vault.adapter.write(
        this.indexFile,
        JSON.stringify({ v: INDEX_VERSION, items: list })
      );
    } catch (err) {
      console.error("[corvus] writeChatIndex failed:", err);
    }
  }

  private scheduleWrite(): void {
    this.dispose();
    this.writeTimer = window.setTimeout(() => {
      this.writeTimer = null;
      if (this.list) void this.writeIndex(this.list);
    }, INDEX_WRITE_DELAY_MS);
  }
}

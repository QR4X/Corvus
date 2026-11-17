import { useEffect, useState } from "react";
import type CorvusPlugin from "../main";
import type { ChatSummary } from "../core/chatPersistence";

export function useChatSummaries(plugin: CorvusPlugin): ChatSummary[] {
  const [chats, setChats] = useState<ChatSummary[]>(plugin.chats.list ?? []);
  useEffect(() => {
    let alive = true;
    void plugin.chats.load().then((all) => {
      if (alive) setChats(all);
    });
    const unsub = plugin.chats.onChange(() =>
      setChats(plugin.chats.list ?? []),
    );
    return () => {
      alive = false;
      unsub();
    };
  }, [plugin]);
  return chats;
}

export function useUnreadChats(plugin: CorvusPlugin): Set<string> {
  const [unread, setUnread] = useState<Set<string>>(() =>
    plugin.chats.unread(),
  );
  useEffect(() => {
    setUnread(plugin.chats.unread());
    return plugin.chats.onUnreadChange(() => setUnread(plugin.chats.unread()));
  }, [plugin]);
  return unread;
}

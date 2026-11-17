import { useEffect, useState } from "react";
import type CorvusPlugin from "../main";
import type { ChatSummary } from "../core/chatPersistence";

export function useChatSummaries(plugin: CorvusPlugin): ChatSummary[] {
  const [chats, setChats] = useState<ChatSummary[]>(plugin.chats.list ?? []);
  useEffect(() => {
    let vivo = true;
    void plugin.chats.load().then((all) => {
      if (vivo) setChats(all);
    });
    const unsub = plugin.chats.onChange(() =>
      setChats(plugin.chats.list ?? []),
    );
    return () => {
      vivo = false;
      unsub();
    };
  }, [plugin]);
  return chats;
}

export function useUnreadChats(plugin: CorvusPlugin): Set<string> {
  const [naoLidas, setNaoLidas] = useState<Set<string>>(() =>
    plugin.chats.unread(),
  );
  useEffect(() => {
    setNaoLidas(plugin.chats.unread());
    return plugin.chats.onUnreadChange(() => setNaoLidas(plugin.chats.unread()));
  }, [plugin]);
  return naoLidas;
}

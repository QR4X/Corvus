import { useMemo, useState } from "react";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import type { ChatSummary } from "../core/chatPersistence";
import { useChatStore } from "../store/chat";
import { ChatList } from "./ChatList";
import { useChatSummaries, useUnreadChats } from "./chatHooks";
import { Icon } from "./Icon";
import { SearchField } from "./SearchField";
import { SearchSheet } from "./SearchSheet";
import { Segmented } from "./Segmented";
import { alertCount } from "./chatAlert";
import {
  SEGMENT_ALL,
  defaultSegment,
  filterSegment,
  moduleSegments,
  searchChats,
} from "./modules";
import { tr } from "../i18n/tr";

export function History({
  plugin,
  session,
  tab,
  onTab,
  onBack,
  onOpenChat,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  tab: string;
  onTab: (id: string) => void;
  onBack: () => void;
  onOpenChat: (chat: ChatSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const chats = useChatSummaries(plugin);
  const unread = useUnreadChats(plugin);
  const waitingId = useChatStore((s) => s.waitingChatId);

  const tabs = moduleSegments(chats);

  const activeTab = tabs.some((s) => s.id === tab)
    ? tab
    : (tabs.find((x) => x.id === defaultSegment(chats, plugin.settings.defaultMode))
        ?.id ?? tabs[0]?.id ?? SEGMENT_ALL);

  const inSegment = useMemo(() => filterSegment(chats, activeTab), [chats, activeTab]);
  const search = useMemo(() => searchChats(inSegment, query), [inSegment, query]);
  const visible = search.hits;

  return (
    <div className="corvus-chat">
      <header className="corvus-topbar is-bare">
        <button
          type="button"
          className="corvus-icon-btn"
          aria-label={tr("Back")}
          onClick={onBack}
        >
          <Icon name="arrow-left" />
        </button>
        {}
        <span className="corvus-brand corvus-topbar-brand">{tr("History")}</span>
      </header>

      <div className="corvus-messages corvus-home">

        {}
        {tabs.length > 1 && (
          <Segmented
            options={tabs.map((s) => ({
              id: s.id,
              label: s.label,
              dot:
                alertCount(chats, s.id, {
                  waitingId,
                  unread,
                }) > 0,
            }))}
            value={activeTab}
            label={tr("Filter chats by mode")}
            onChange={onTab}
          />
        )}

        {}
        <SearchField
          value={query}
          placeholder={tr("Search")}
          label={tr("Search chats")}
          found={visible.length}
          onChange={setQuery}
          onOpen={() => setSearchOpen(true)}
        />

        {visible.length > 0 && (
          <ChatList
            plugin={plugin}
            session={session}
            chats={visible}
            onOpen={onOpenChat}
          />
        )}

        {visible.length === 0 && (
          <div className="corvus-home-empty">
            <Icon name="message-circle" size={42} />
            <p>
              {query.trim()
                ? tr("Nothing matches that search.")
                : tr("Nothing here yet.")}
            </p>
          </div>
        )}
      </div>

      {}
      <SearchSheet
        open={searchOpen}
        title={tr("Search chats")}
        placeholder={tr("Search")}
        value={query}
        found={visible.length}
        invalid={search.invalid}
        onChange={setQuery}
        onClose={() => setSearchOpen(false)}
      >
        {visible.length > 0 ? (
          <ChatList
            plugin={plugin}
            session={session}
            chats={visible}
            onOpen={(c) => {

              setSearchOpen(false);
              onOpenChat(c);
            }}
          />
        ) : (
          <div className="corvus-home-empty">
            <Icon name="search" size={42} />
            <p>
              {query.trim()
                ? tr("Nothing matches that search.")
                : tr("Type to search your chats.")}
            </p>
          </div>
        )}
      </SearchSheet>
    </div>
  );
}

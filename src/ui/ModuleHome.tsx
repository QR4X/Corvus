import { useMemo, useState } from "react";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import { isChatMode } from "../core/session";
import type { ChatSummary } from "../core/chatPersistence";
import { ChatList } from "./ChatList";
import { useChatSummaries } from "./chatHooks";
import { Icon } from "./Icon";
import { SearchField } from "./SearchField";
import { SearchSheet } from "./SearchSheet";
import { openActions } from "./menu";
import {
  chatsOfModule,
  moduleEmptyLine,
  moduleFabLabel,
  moduleIcon,
  moduleLabel,
  searchChats,
} from "./modules";
import { mark, tr } from "../i18n/tr";

const PERIODS: Array<{
  id: string;
  label: string;

  empty: string;
  days: number;
}> = [
  {
    id: "all",
    label: mark("All"),
    empty: mark("Nothing in all."),
    days: 0,
  },
  {
    id: "today",
    label: mark("Today"),
    empty: mark("Nothing in today."),
    days: 1,
  },
  {
    id: "week",
    label: mark("This week"),
    empty: mark("Nothing in this week."),
    days: 7,
  },
  {
    id: "month",
    label: mark("This month"),
    empty: mark("Nothing in this month."),
    days: 30,
  },
];

export function ModuleHome({
  plugin,
  session,
  moduleId,
  onBack,
  onOpenChat,
  onNewChat,
  onOpenSkills,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  moduleId: string;

  onBack: () => void;
  onOpenChat: (chat: ChatSummary) => void;
  onNewChat: () => void;
  onOpenSkills: () => void;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [period, setPeriod] = useState(PERIODS[0]);
  const allChats = useChatSummaries(plugin);
  const moduleChats = useMemo(() => chatsOfModule(allChats, moduleId), [allChats, moduleId]);

  const isAgent = moduleId === "agent";

  const inPeriod = useMemo(() => {
    if (!isAgent || period.days === 0) return moduleChats;
    const cutoff = Date.now() - period.days * 86400000;
    return moduleChats.filter((c) => new Date(c.date).getTime() >= cutoff);
  }, [isAgent, moduleChats, period]);

  const search = useMemo(
    () => searchChats(inPeriod, query),
    [inPeriod, query]
  );
  const visible = search.hits;
  const searching = query.trim().length > 0;

  const canCreate = isChatMode(moduleId);

  return (
    <div className="corvus-chat">
      <header className="corvus-topbar is-bare">
        {}
        <button
          type="button"
          className="corvus-icon-btn"
          aria-label={tr("Back")}
          onClick={onBack}
        >
          <Icon name="arrow-left" />
        </button>
        <span className="corvus-brand corvus-topbar-brand">
          {moduleLabel(moduleId)}
        </span>
      </header>

      <div className="corvus-messages corvus-home">

        {isAgent && (
          <section className="corvus-home-block">
            <span className="corvus-section-label">{tr("Skills")}</span>
            {}
            <button
              type="button"
              className="corvus-home-pill"
              onClick={onOpenSkills}
            >
              <Icon name="plus" size={18} />
              <span>{tr("Add skill")}</span>
            </button>
          </section>
        )}

        {}
        <SearchField
          value={query}
          placeholder={tr("Search")}
          label={tr("Search {module}", { module: moduleLabel(moduleId) })}
          found={visible.length}
          onChange={setQuery}
          onOpen={() => setSearchOpen(true)}
        />

        {isAgent && (
          <div className="corvus-home-headrow">
            <span className="corvus-section-label">{tr("Sessions")}</span>
            <button
              type="button"
              className="corvus-home-filter"
              aria-label={tr("Filter sessions by period")}
              onClick={(e) =>
                openActions(
                  e,
                  PERIODS.map((p) => ({
                    label: tr(p.label),
                    checked: p.id === period.id,
                    run: () => setPeriod(p),
                  }))
                )
              }
            >
              <span>{tr(period.label)}</span>
              <Icon name="chevron-down" size={16} />
            </button>
          </div>
        )}

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
            <Icon name={moduleIcon(moduleId)} size={42} />
            <p>
              {moduleChats.length === 0
                ? moduleEmptyLine(moduleId)
                : searching
                  ? tr("Nothing matches that search.")
                  : tr(period.empty)}
            </p>
          </div>
        )}

        {}
        {canCreate && (
          <button type="button" className="corvus-fab" onClick={onNewChat}>
            <Icon name="plus" size={20} />
            <span>{moduleFabLabel(moduleId)}</span>
          </button>
        )}
      </div>

      {}
      <SearchSheet
        open={searchOpen}
        title={tr("Search {module}", { module: moduleLabel(moduleId) })}
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
                : tr("Type to search {module}.", {
                    module: moduleLabel(moduleId),
                  })}
            </p>
          </div>
        )}
      </SearchSheet>
    </div>
  );
}

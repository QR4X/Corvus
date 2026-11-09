import { useMemo, useState } from "react";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import { isChatMode } from "../core/session";
import type { ChatSummary } from "../core/chatPersistence";
import { ChatList, useChatSummaries } from "./ChatList";
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

const PERIODOS: Array<{
  id: string;
  label: string;

  vazio: string;
  dias: number;
}> = [
  {
    id: "all",
    label: mark("All"),
    vazio: mark("Nothing in all."),
    dias: 0,
  },
  {
    id: "today",
    label: mark("Today"),
    vazio: mark("Nothing in today."),
    dias: 1,
  },
  {
    id: "week",
    label: mark("This week"),
    vazio: mark("Nothing in this week."),
    dias: 7,
  },
  {
    id: "month",
    label: mark("This month"),
    vazio: mark("Nothing in this month."),
    dias: 30,
  },
];

export function ModuleHome({
  plugin,
  session,
  modulo,
  onBack,
  onOpenChat,
  onNewChat,
  onOpenSkills,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  modulo: string;

  onBack: () => void;
  onOpenChat: (chat: ChatSummary) => void;
  onNewChat: () => void;
  onOpenSkills: () => void;
}) {
  const [query, setQuery] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [periodo, setPeriodo] = useState(PERIODOS[0]);
  const todas = useChatSummaries(plugin);
  const minhas = useMemo(() => chatsOfModule(todas, modulo), [todas, modulo]);

  const ehAgent = modulo === "agent";

  const noPeriodo = useMemo(() => {
    if (!ehAgent || periodo.dias === 0) return minhas;
    const corte = Date.now() - periodo.dias * 86400000;
    return minhas.filter((c) => new Date(c.date).getTime() >= corte);
  }, [ehAgent, minhas, periodo]);

  const busca = useMemo(
    () => searchChats(noPeriodo, query),
    [noPeriodo, query]
  );
  const visiveis = busca.hits;
  const procurando = query.trim().length > 0;

  const podeCriar = isChatMode(modulo);

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
          {moduleLabel(modulo)}
        </span>
      </header>

      <div className="corvus-messages corvus-home">

        {ehAgent && (
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
          label={tr("Search {module}", { module: moduleLabel(modulo) })}
          found={visiveis.length}
          onChange={setQuery}
          onOpen={() => setBuscando(true)}
        />

        {ehAgent && (
          <div className="corvus-home-headrow">
            <span className="corvus-section-label">{tr("Sessions")}</span>
            <button
              type="button"
              className="corvus-home-filter"
              aria-label={tr("Filter sessions by period")}
              onClick={(e) =>
                openActions(
                  e,
                  PERIODOS.map((p) => ({
                    label: tr(p.label),
                    checked: p.id === periodo.id,
                    run: () => setPeriodo(p),
                  }))
                )
              }
            >
              <span>{tr(periodo.label)}</span>
              <Icon name="chevron-down" size={16} />
            </button>
          </div>
        )}

        {visiveis.length > 0 && (
          <ChatList
            plugin={plugin}
            session={session}
            chats={visiveis}
            onOpen={onOpenChat}
          />
        )}

        {visiveis.length === 0 && (
          <div className="corvus-home-empty">
            <Icon name={moduleIcon(modulo)} size={42} />
            <p>
              {minhas.length === 0
                ? moduleEmptyLine(modulo)
                : procurando
                  ? tr("Nothing matches that search.")
                  : tr(periodo.vazio)}
            </p>
          </div>
        )}

        {}
        {podeCriar && (
          <button type="button" className="corvus-fab" onClick={onNewChat}>
            <Icon name="plus" size={20} />
            <span>{moduleFabLabel(modulo)}</span>
          </button>
        )}
      </div>

      {}
      <SearchSheet
        open={buscando}
        title={tr("Search {module}", { module: moduleLabel(modulo) })}
        placeholder={tr("Search")}
        value={query}
        found={visiveis.length}
        invalid={busca.invalida}
        onChange={setQuery}
        onClose={() => setBuscando(false)}
      >
        {visiveis.length > 0 ? (
          <ChatList
            plugin={plugin}
            session={session}
            chats={visiveis}
            onOpen={(c) => {

              setBuscando(false);
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
                    module: moduleLabel(modulo),
                  })}
            </p>
          </div>
        )}
      </SearchSheet>
    </div>
  );
}

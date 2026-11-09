import { useMemo, useState } from "react";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import type { ChatSummary } from "../core/chatPersistence";
import { useChatStore } from "../store/chat";
import { ChatList, useChatSummaries, useUnreadChats } from "./ChatList";
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
  aba,
  onAba,
  onBack,
  onOpenChat,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  aba: string;
  onAba: (id: string) => void;
  onBack: () => void;
  onOpenChat: (chat: ChatSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [buscando, setBuscando] = useState(false);
  const chats = useChatSummaries(plugin);
  const naoLidas = useUnreadChats(plugin);
  const esperandoId = useChatStore((s) => s.waitingChatId);

  const abas = moduleSegments(chats);

  const atual = abas.some((s) => s.id === aba)
    ? aba
    : (abas.find((x) => x.id === defaultSegment(chats, plugin.settings.defaultMode))
        ?.id ?? abas[0]?.id ?? SEGMENT_ALL);

  const doSeg = useMemo(() => filterSegment(chats, atual), [chats, atual]);
  const busca = useMemo(() => searchChats(doSeg, query), [doSeg, query]);
  const visiveis = busca.hits;

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
        {abas.length > 1 && (
          <Segmented
            options={abas.map((s) => ({
              id: s.id,
              label: s.label,
              dot:
                alertCount(chats, s.id, {
                  esperando: esperandoId,
                  naoLidas,
                }) > 0,
            }))}
            value={atual}
            label={tr("Filter chats by mode")}
            onChange={onAba}
          />
        )}

        {}
        <SearchField
          value={query}
          placeholder={tr("Search")}
          label={tr("Search chats")}
          found={visiveis.length}
          onChange={setQuery}
          onOpen={() => setBuscando(true)}
        />

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
        open={buscando}
        title={tr("Search chats")}
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
                : tr("Type to search your chats.")}
            </p>
          </div>
        )}
      </SearchSheet>
    </div>
  );
}

// src/ui/ModuleHome.tsx
// A HOME de um módulo — a porta de entrada de Chat, Vault Q&A ou Agent.
//
// É uma página inteira e independente, não um painel dentro do menu nem a
// tela de uma conversa vazia: nome grande, as conversas daquele módulo em
// cartões e um botão flutuante pra começar outra. Não há campo de texto de
// propósito — esta tela é sobre ESCOLHER, não sobre escrever.
//
// E cada uma tem a SUA mobília, como na referência (lá Chats, Code e Cowork
// não se parecem): o Agent abre com as skills à mão e a lista de sessões
// filtrável por período, porque uma sessão de agente é trabalho datado; Chat
// e Vault Q&A abrem com busca, porque ali o que se procura é assunto.

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
import { marca, tr } from "../i18n/tr";

/** Janelas do filtro de período do Agent, em dias (0 = tudo). */
const PERIODOS: Array<{
  id: string;
  label: string;
  /** A lista vazia naquele período, em frase inteira: montar "Nothing in" +
   *  o rótulo não vira português palavra por palavra. */
  vazio: string;
  dias: number;
}> = [
  {
    id: "all",
    label: marca("All"),
    vazio: marca("Nothing in all."),
    dias: 0,
  },
  {
    id: "today",
    label: marca("Today"),
    vazio: marca("Nothing in today."),
    dias: 1,
  },
  {
    id: "week",
    label: marca("This week"),
    vazio: marca("Nothing in this week."),
    dias: 7,
  },
  {
    id: "month",
    label: marca("This month"),
    vazio: marca("Nothing in this month."),
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
  /** Sai desta tela — volta pra home. */
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

  // Período primeiro (só o Agent tem), busca depois: a busca procura DENTRO
  // do que está sendo mostrado, senão o filtro viraria mentira na tela.
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

  // Módulo que este código não conhece (pasta criada por outra versão): dá pra
  // ler o que está lá, não dá pra criar — o motor não sabe rodar nesse modo.
  const podeCriar = isChatMode(modulo);

  return (
    <div className="corvus-chat">
      <header className="corvus-topbar is-bare">
        {/* Seta, não hambúrguer: o menu mora na home, e esta tela é um lugar
            DENTRO dela. Antes daqui só se saía pelo menu — um lugar que só
            tem porta lateral. */}
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
            {/* O que o agente sabe fazer é o que ele TEM à mão — por isso as
                skills abrem a home dele, do mesmo jeito que os aparelhos
                abrem a tela de Code na referência. */}
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

        {/* A pílula é GATILHO: quem toca vai pra folha de busca, onde o
            teclado não cobre o resultado (ver SearchSheet.tsx). */}
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

        {/* DENTRO do scroller, grudado na base com `sticky`. Fora dele ele
            precisaria de um ancestral posicionado — e `.corvus-chat` não é
            posicionado: foi assim que o composer `absolute` foi parar colado
            no header do aparelho (ver o bloco do composer no CSS). */}
        {podeCriar && (
          <button type="button" className="corvus-fab" onClick={onNewChat}>
            <Icon name="plus" size={20} />
            <span>{moduleFabLabel(modulo)}</span>
          </button>
        )}
      </div>

      {/* Busca com regex: `^draft`, `readme|changelog`, `gpt-5$`. O campo NÃO
          anuncia isso: termo comum também é regex válida, então pra quem só
          quer procurar palavra a palavra "regex" no rótulo é uma instrução a
          mais pra ler e ignorar. Quem precisa, digita e funciona. */}
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
              // Fecha a busca ANTES de sair: voltar da conversa e encontrar a
              // folha ainda aberta por cima seria um fantasma.
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

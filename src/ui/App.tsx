// src/ui/App.tsx
// A casca. Uma tela por vez + o menu lateral.
//
// As telas são: a HOME de um módulo (Chat, Vault Q&A, Agent — cada um com a
// sua, ver ModuleHome.tsx), a conversa em si, e as páginas de Projects e
// Skills. O menu é só navegação: leva a uma delas e sai da frente.
// Tudo que a UI faz passa pela ChatSession (src/core/session.ts) ou pelo plugin.

import { useCallback, useEffect, useReducer, useState } from "react";
import type CorvusPlugin from "../main";
import { isChatMode, type ChatSession } from "../core/session";
import { SEGMENT_ALL, startupMode } from "./modules";
import type { Skill } from "../skills/skills";
import { ChatView } from "./ChatView";
import { Dashboard } from "./Dashboard";
import { History } from "./History";
import { UsageView } from "./UsageView";
import { FILTRO_VAZIO, type UsageFilter } from "../usage/filters";
import { ModuleHome } from "./ModuleHome";
import { ProjectsView } from "./ProjectsView";
import { SkillsView } from "./SkillsView";
import { Drawer, type ViewId } from "./Drawer";
import { PainelCtx } from "./painel";
import { ChatInstructionsSheet } from "./ChatInstructionsSheet";
import type { ChatSummary } from "../core/chatPersistence";
import { Notice } from "obsidian";
import { ouvirPedidos } from "../editor/ponte";
import { readNote } from "./notePicker";
import { useChatStore } from "../store/chat";
import { tr } from "../i18n/tr";

export interface ComposerInject {
  text: string;
  nonce: number;
}

export function App({
  plugin,
  session,
  onScreenChange,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  /** A TELA mudou (conversa × painel/histórico/uso/…). O fullscreen mobile
   *  depende disso e é reativo, então a view precisa saber na hora. */
  onScreenChange?: () => void;
}) {
  // Abre no PAINEL, não numa conversa vazia: a primeira pergunta de quem
  // abre o app não é "o que eu escrevo", é "onde eu estava". A exceção é quem
  // pediu nas settings (Chat → "Start with a new chat") para cair direto numa
  // conversa nova de um modo: aí já é nela que se começa.
  const modoDeAbertura = startupMode(plugin.settings.startupChatMode);
  const [view, setView] = useState<ViewId>(modoDeAbertura ? "chat" : "home");
  const [menuOpen, setMenuOpen] = useState(false);
  /** De qual módulo é a home que está aberta (ou foi a última). */
  const [modulo, setModulo] = useState<string>(
    () => modoDeAbertura ?? (plugin.settings.defaultMode || "chat")
  );
  const [inject, setInject] = useState<ComposerInject | null>(null);
  /** De onde se entrou na conversa — é pra lá que a seta de voltar leva.
   *  A seta tem que desfazer o toque que trouxe você, não levar a um lugar
   *  parecido: quem abriu do painel volta ao painel, quem abriu da tela do
   *  módulo volta pra ela. */
  const [voltarPara, setVoltarPara] = useState<
    "home" | "history" | "module" | "usage" | "projects" | "skills"
  >("module");
  /** Qual projeto está aberto. Mora AQUI, e não dentro da tela de projetos,
   *  por causa da seta de voltar: entrar numa conversa desmonta a tela, e com
   *  o estado lá dentro a volta caía na lista — perdendo o projeto que a
   *  pessoa tinha aberto dois toques antes. */
  const [projetoAberto, setProjetoAberto] = useState<string | null>(null);
  /** O recorte da página de uso — mora aqui pelo mesmo motivo do projeto
   *  aberto: abrir uma conversa da lista dela desmonta a página, e a seta de
   *  voltar tem que devolver o recorte que a pessoa montou, não um zerado. */
  const [filtroDeUso, setFiltroDeUso] = useState<UsageFilter>(FILTRO_VAZIO);
  /** Projetos e Skills não são TELAS: são folhas que sobem por cima do que
   *  você está fazendo, entregam o que você foi buscar e descem. Por isso
   *  moram aqui, e não em `view` — a tela debaixo não se perde. */
  const [painel, setPainel] = useState<"projects" | "skills" | null>(null);
  /** Conversa que vai entrar no PRÓXIMO projeto criado (o "New project…" do
   *  menu de uma conversa). Some assim que o projeto nasce. */
  const [chatParaProjeto, setChatParaProjeto] = useState<string | null>(null);
  /** Conversa esperando que você ESCOLHA um projeto na folha (o "See all" do
   *  menu). Enquanto vale, a lista de projetos escolhe em vez de abrir. */
  const [escolhaPara, setEscolhaPara] = useState<string | null>(null);
  /** Conversa cujas INSTRUÇÕES estão abertas na folha (o ⋯ dela). */
  const [instrucoesPara, setInstrucoesPara] = useState<ChatSummary | null>(null);
  /** O recorte da lista, compartilhado pela home e pelo histórico: filtrar
   *  numa e pedir "ver tudo" leva o filtro junto. */
  const [aba, setAba] = useState(SEGMENT_ALL);
  const [, force] = useReducer((n: number) => n + 1, 0);
  // Re-render em mudanças de sessão (seleção/lock) e de settings.
  useEffect(() => {
    const u1 = session.onChange(force);
    const u2 = plugin.onSettingsChange(force);
    return () => {
      u1();
      u2();
    };
  }, [session, plugin]);

  // A TELA mudou (conversa ↔ painel/histórico/uso/…)? O fullscreen mobile
  // depende disso: a conversa liga o modo sozinha, as outras telas devolvem o
  // valor da setting. Aqui o CorvusView recalcula na hora — sem este aviso a
  // moldura só apareceria/sumiria quando o observer da gaveta disparasse
  // (260ms depois). A `view` já mudou no DOM quando o efeito roda, então a
  // marca `corvus-chat-open` lida pela view é a nova.
  useEffect(() => {
    onScreenChange?.();
  }, [view, onScreenChange]);

  // Ao ABRIR o painel, a conversa nova do modo escolhido já está na tela: a
  // pessoa digita e envia. Roda uma vez por montagem da view (é o "ao abrir"):
  // `session` e `plugin` são estáveis enquanto a view viver.
  useEffect(() => {
    const m = startupMode(plugin.settings.startupChatMode);
    if (!m) return;
    session.newChat(m);
    setInject({ text: "", nonce: Date.now() });
    setVoltarPara("home");
    setView("chat");
  }, [session, plugin]);

  // O que vem do EDITOR (comandos e clique direito — ver editor/ponte.ts):
  // uma nota vira conversa nova com ela anexada; um trecho selecionado vai
  // pra conversa aberta. Os dois terminam na tela da conversa, com o campo
  // aceso — ou já enviando, no "Summarize this note".
  useEffect(
    () =>
      ouvirPedidos((p) => {
        void (async () => {
          const st = useChatStore.getState();
          if (p.tipo === "nota") {
            const nota = await readNote(plugin.app, p.path);
            if (!nota) {
              new Notice(tr("Note not found: {path}", { path: p.path }));
              return;
            }
            session.newChat();
            useChatStore.getState().addAttachment({ type: "note", path: nota.path, content: nota.content });
          } else {
            // Sem conversa na tela, o trecho começa uma; com conversa, entra
            // nela — "manda isto pro chat" é pro chat que está aberto.
            if (view !== "chat" && st.messages.length === 0) session.newChat();
            useChatStore.getState().addAttachment({
              type: "note",
              path: `${p.path} (selection)`,
              content: p.texto,
            });
          }
          setPainel(null);
          setMenuOpen(false);
          setVoltarPara("home");
          setView("chat");
          if (p.tipo === "nota" && p.enviar) await session.send(p.enviar);
          else setInject({ text: "", nonce: Date.now() });
        })();
      }),
    [session, plugin, view]
  );

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  /** O que o menu faz com cada destino: dois viram folha, o resto vira tela. */
  const navegar = useCallback((id: ViewId) => {
    if (id === "projects" || id === "skills") {
      setPainel(id);
      return;
    }
    // Entrar no uso é começar do zero; só a VOLTA de uma conversa aberta de
    // lá devolve o recorte (ver `filtroDeUso`).
    if (id === "usage") setFiltroDeUso(FILTRO_VAZIO);
    setView(id);
  }, []);

  /** Entrar num módulo pelo menu: abre a HOME dele. */
  const entrarNoModulo = useCallback((mode: string) => {
    setModulo(mode);
    setView("module");
    setPainel(null);
    setMenuOpen(false);
  }, []);

  // usarSkill e não useSkill: função comum, não hook. Com o prefixo `use`
  // as regras de hooks a tratavam como tal e acusavam chamada dentro de
  // callback — e quem lesse o código levava o mesmo susto.
  const usarSkill = (skill: Skill) => {
    // Skill com modo preferido troca o modo (no-op se a sessão já travou).
    if (isChatMode(skill.mode)) session.setMode(skill.mode);
    setInject({ text: skill.body, nonce: Date.now() });
    setView("chat");
  };

  return (
    <PainelCtx.Provider
      value={{
        novoProjetoCom: (chatId: string) => {
          setChatParaProjeto(chatId);
          setEscolhaPara(null);
          setProjetoAberto(null);
          setPainel("projects");
        },
        escolherProjetoPara: (chatId: string) => {
          setEscolhaPara(chatId);
          setChatParaProjeto(chatId);
          setProjetoAberto(null);
          setPainel("projects");
        },
        instrucoesDe: (chat: ChatSummary) => setInstrucoesPara(chat),
      }}
    >
    <div className={view === "chat" ? "corvus-root corvus-chat-open" : "corvus-root"}>
      {view === "home" ? (
        <Dashboard
          plugin={plugin}
          session={session}
          aba={aba}
          onAba={setAba}
          onOpenHistory={() => setView("history")}
          onOpenUsage={() => {
            setFiltroDeUso(FILTRO_VAZIO);
            setView("usage");
          }}
          onOpenMenu={() => setMenuOpen(true)}
          // Cartão do painel: conversa nova naquele modo, JÁ ESCREVENDO. O
          // `inject` sem texto é exatamente isso — "põe o cursor no campo" —
          // e é o mesmo caminho que a skill usa pra chegar lá com texto.
          onNewChat={(m) => {
            session.newChat(m);
            setModulo(m);
            setInject({ text: "", nonce: Date.now() });
            setVoltarPara("home");
            setView("chat");
          }}
          onOpenChat={() => {
            setVoltarPara("home");
            setView("chat");
          }}
        />
      ) : view === "usage" ? (
        <UsageView
          plugin={plugin}
          session={session}
          onBack={() => setView("home")}
          filtro={filtroDeUso}
          onFiltro={setFiltroDeUso}
          // Uma conversa da lista do topo: quem carrega é a própria linha
          // (como na ChatList); aqui só se troca de tela, e a seta volta pro
          // uso.
          onOpenChat={() => {
            setVoltarPara("usage");
            setView("chat");
          }}
        />
      ) : view === "history" ? (
        <History
          plugin={plugin}
          session={session}
          aba={aba}
          onAba={setAba}
          onBack={() => setView("home")}
          onOpenChat={() => {
            setVoltarPara("history");
            setView("chat");
          }}
        />
      ) : view === "module" ? (
        <ModuleHome
          plugin={plugin}
          session={session}
          modulo={modulo}
          onBack={() => setView("home")}
          // Só troca de tela: quem manda carregar é a própria lista
          // (ChatList.abrir). Carregar aqui de novo era pedir a mesma conversa
          // duas vezes — inofensivo pelo guarda de identidade da sessão, mas
          // ainda assim uma segunda ida ao disco por toque.
          onOpenChat={() => {
            setVoltarPara("module");
            setView("chat");
          }}
          onNewChat={() => {
            if (isChatMode(modulo)) session.newChat(modulo);
            setVoltarPara("module");
            setView("chat");
          }}
          onOpenSkills={() => setPainel("skills")}
        />
      ) : view === "chat" ? (
        <ChatView
          plugin={plugin}
          session={session}
          inject={inject}
          // Volta pra ONDE SE ENTROU. E, quando isso é a tela de um módulo,
          // é a do módulo DESTA conversa — não a da última visitada: se você
          // abriu um chat de Agent vindo do Chat, voltar leva ao Agent, que é
          // onde ele mora.
          onBackHome={() => {
            // Voltar de uma conversa aberta por uma FOLHA reabre a folha, por
            // cima da tela em que ela estava — a seta desfaz o toque que
            // trouxe você, e o toque foi na gaveta, não numa tela.
            if (voltarPara === "projects" || voltarPara === "skills") {
              setPainel(voltarPara);
              setView("home");
              return;
            }
            if (voltarPara !== "module") {
              setView(voltarPara);
              return;
            }
            const m = session.config.mode;
            setModulo(m);
            setView("module");
          }}
          onUseSkill={usarSkill}
        />
      ) : null}

      {/* As duas folhas ficam FORA do rodízio de telas: elas não substituem o
          que está embaixo, sobem por cima. Montadas sempre (é assim que elas
          deslizam em vez de aparecer), e fechadas por padrão. */}
      <ProjectsView
        plugin={plugin}
        session={session}
        open={painel === "projects"}
        abertoId={projetoAberto}
        onAbrir={setProjetoAberto}
        chatPendente={chatParaProjeto}
        onChatPendente={setChatParaProjeto}
        escolhaPara={escolhaPara}
        onEscolha={() => {
          setEscolhaPara(null);
          setChatParaProjeto(null);
          setPainel(null);
        }}
        onClose={() => {
          setPainel(null);
          setEscolhaPara(null);
          setChatParaProjeto(null);
        }}
        onOpenChat={() => {
          // Entrar na conversa FECHA a folha — e a seta de voltar da conversa
          // reabre ela no mesmo projeto, que é o toque que trouxe você.
          setPainel(null);
          setVoltarPara("projects");
          setView("chat");
        }}
      />
      <SkillsView
        plugin={plugin}
        open={painel === "skills"}
        onClose={() => setPainel(null)}
        onUse={(sk) => {
          setPainel(null);
          setVoltarPara("skills");
          usarSkill(sk);
        }}
      />

      <ChatInstructionsSheet
        plugin={plugin}
        chat={instrucoesPara}
        open={instrucoesPara !== null}
        onClose={() => setInstrucoesPara(null)}
      />

      <Drawer
        plugin={plugin}
        session={session}
        open={menuOpen}
        view={painel ?? view}
        modulo={modulo}
        onEnterModule={entrarNoModulo}
        onNavigate={navegar}
        onClose={closeMenu}
      />
    </div>
    </PainelCtx.Provider>
  );
}

// src/i18n/ui-pt/shell.ts
// pt-BR da interface: a casca (App, home, menu lateral, histórico, módulos, modais).
// Chave = o texto em inglês do código (ver i18n/tr.ts). As {variáveis} da
// chave têm que aparecer na tradução — o teste de cobertura confere.

export const PT_SHELL: Record<string, string> = {
  // App.tsx
  "Note not found: {path}": "Nota não encontrada: {path}",

  // Dashboard.tsx (o "See all {n}" vale também pro submenu de projetos da ChatList)
  "Open menu": "Abrir menu",
  "Exit fullscreen": "Sair da tela cheia",
  "Fullscreen": "Tela cheia",
  "Chat mode": "Modo da conversa",
  "Pick up where you left": "Continue de onde parou",
  "See all {n}": "Ver tudo ({n})",
  "or": "ou",
  "Start something new": "Comece algo novo",

  // Drawer.tsx (o "Skills" também é o título da seção na home do Agent)
  "Projects": "Projetos",
  "Skills": "Skills",
  "Usage": "Uso",
  "Corvus menu": "Menu do Corvus",
  "Close menu": "Fechar menu",
  "Settings": "Configurações",

  // History.tsx ("Back", "Search" e a busca vazia valem também na ModuleHome e no menu.ts)
  "Back": "Voltar",
  "History": "Histórico",
  "Filter chats by mode": "Filtrar conversas por modo",
  "Search": "Buscar",
  "Search chats": "Buscar conversas",
  "Nothing matches that search.": "Nada bate com essa busca.",
  "Nothing here yet.": "Nada aqui ainda.",
  "Type to search your chats.": "Digite pra buscar nas suas conversas.",

  // ChatList.tsx
  "1 action": "1 ação",
  "{n} actions": "{n} ações",
  "No actions": "Nenhuma ação",
  "Rename chat": "Renomear conversa",
  "Title": "Título",
  "Rename": "Renomear",
  "Could not star: {error}": "Não deu pra favoritar: {error}",
  "Marked as unread.": "Marcada como não lida.",
  "Exported to {path}": "Exportada pra {path}",
  "Export failed: {error}": "Não deu pra exportar: {error}",
  "Added to project.": "Adicionada ao projeto.",
  "Added to {name}.": "Adicionada a {name}.",
  "Delete \"{title}\"?": "Apagar \"{title}\"?",
  "Untitled": "Sem título",
  "The chat file goes to the system trash (recoverable).":
    "O arquivo da conversa vai pra lixeira do sistema (dá pra recuperar).",
  "Delete": "Apagar",
  "Actions for {title}": "Ações de {title}",
  "Unstar": "Desfavoritar",
  "Star": "Favoritar",
  "Mark as unread": "Marcar como não lida",
  "Add to project": "Adicionar a um projeto",
  "New project…": "Novo projeto…",
  "Instructions…": "Instruções…",
  "Export to vault": "Exportar pro vault",

  // ModuleHome.tsx (o filtro de período do Agent e a lista vazia de cada período)
  "All": "Tudo",
  "Nothing in all.": "Nada por aqui.",
  "Today": "Hoje",
  "Nothing in today.": "Nada hoje.",
  "This week": "Esta semana",
  "Nothing in this week.": "Nada nesta semana.",
  "This month": "Este mês",
  "Nothing in this month.": "Nada neste mês.",
  "Add skill": "Adicionar skill",
  "Search {module}": "Buscar em {module}",
  "Sessions": "Sessões",
  "Filter sessions by period": "Filtrar sessões por período",
  "Type to search {module}.": "Digite pra buscar em {module}.",

  // modules.ts — a descrição de cada módulo (o nome do modo fica em inglês)
  "Just you and the model. Your notes stay out of it.":
    "Só você e o modelo. Suas notas ficam de fora.",
  "Answers grounded in your notes, found by local search.":
    "Respostas baseadas nas suas notas, achadas por busca local.",
  "Reads and edits your vault — every change asks first.":
    "Lê e edita o seu vault — toda mudança pergunta antes.",
  "Message the model…": "Escreva pro modelo…",
  "Ask something about your notes…": "Pergunte algo sobre as suas notas…",
  "Tell the agent what to do in your vault…": "Diga pro agente o que fazer no seu vault…",
  "Ask anything. Your chats show up here.":
    "Pergunte qualquer coisa. Suas conversas aparecem aqui.",
  "Ask about your notes. The answers land here.":
    "Pergunte sobre as suas notas. As respostas chegam aqui.",
  "Put the agent to work in your vault. Runs show up here.":
    "Ponha o agente pra trabalhar no seu vault. O que ele rodar aparece aqui.",
  "New chat": "Nova conversa",
  "New question": "Nova pergunta",
  "New session": "Nova sessão",
  "Chats saved here by another version. This one can't start new ones.":
    "Conversas gravadas aqui por outra versão. Esta não consegue criar novas.",
  // modules.ts — o tempo relativo (o "53m", "10h", "3d" do cartão é igual em português)
  "now": "agora",
  "Yesterday": "Ontem",
  "{n} days ago": "há {n} dias",
  "No chats yet": "Nenhuma conversa ainda",
  "1 chat": "1 conversa",
  "{n} chats": "{n} conversas",

  // modals.ts
  "Cancel": "Cancelar",
  "OK": "OK",
  "Confirm": "Confirmar",
  "Open Settings → Community plugins → Corvus.":
    "Abra Configurações → Plugins da comunidade → Corvus.",

  // iconCatalog.ts — as categorias do catálogo de ícones
  "Work": "Trabalho",
  "Study": "Estudo",
  "Writing": "Escrita",
  "Code": "Código",
  "Creative": "Criação",
  "Home": "Casa",
  "Health": "Saúde",
  "Nature": "Natureza",
  "Travel": "Viagem",
  "Life": "Vida",
  "Food": "Comida",
  "Symbols": "Símbolos",
};

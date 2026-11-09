// src/core/vaultPaths.ts
// Onde o app guarda o que ele cria — e o que fica ESCONDIDO do vault.
//
// O Obsidian ignora qualquer pasta que comece com ponto: ela não entra no
// índice, não aparece no explorador, não entra na busca nem no grafo — e o
// mesmo vale pro Sync do Obsidian e pra maioria dos plugins de file-sync
// (Google Drive, …).
//
// As CONVERSAS moram numa pasta VISÍVEL de propósito: é ela que um sync de
// arquivos copia entre aparelhos — pasta com ponto nunca chegaria lá (foi
// exatamente esse o bug: chats nasciam em `.corvus/chats` e sumiam do vault
// sincronizado). O custo é que elas aparecem na busca, no explorador e no
// grafo; quem não quer aponta o campo "Chats folder" pra uma pasta com ponto.
//
// O que continua HIDDEN é só o que se REFAZ: o índice do RAG é cache — o
// motor o reconstrói, então pode ficar invisível sem custo de sync.
//
//   • conversas → VISÍVEIS (sync-friendly).
//   • índice do RAG → escondido (cache, se refaz; quem lê é só o motor, por
//     `adapter`, que enxerga pasta oculta).
//   • skills → visíveis. Skill é uma nota que a PESSOA escreve; escondida, ela
//     não abre no Obsidian pra ser editada.
//   • mídia gerada e relatórios → visíveis. Escondidos, não dá pra `![[embutir]]`
//     nem abrir: o Obsidian não resolve link pra fora do índice.

/** A pasta oculta do app — só o que é cache e se refaz mora aqui. */
export const CORVUS_HIDDEN = ".corvus";

/** Pasta VISÍVEL das conversas. Ponto na frente quebraria o sync de arquivos
 *  (Google Drive, Obsidian Sync…), que é justamente o motivo dela existir. */
export const CHATS_FOLDER = "corvus/chats";

/** Uma pasta que muda de lugar, e de onde ela vinha. */
export interface HiddenMove {
  /** Onde ficava (o default antigo). */
  legado: string;
  /** Onde passa a ficar. */
  novo: string;
  /** Qual campo do settings passa a apontar pro `novo` após mover. */
  campo: "chatsPath" | "ragIndexPath";
}

/**
 * O que migra: todo lugar ANTIGO das conversas (legado `corvus-ai/chats` e o
 * default oculto anterior `.corvus/chats`) agora cai na pasta VISÍVEL; o índice
 * do RAG vai pra oculta (cache, se refaz). O resto continua visível de
 * propósito (ver o cabeçalho).
 */
export const HIDDEN_MOVES: HiddenMove[] = [
  { legado: "corvus-ai/chats", novo: CHATS_FOLDER, campo: "chatsPath" },
  { legado: `${CORVUS_HIDDEN}/chats`, novo: CHATS_FOLDER, campo: "chatsPath" },
  { legado: "corvus-ai/index", novo: `${CORVUS_HIDDEN}/index`, campo: "ragIndexPath" },
];

/** Está numa pasta que o Obsidian ignora? */
export function isHiddenPath(path: string): boolean {
  return path.split("/").some((parte) => parte.startsWith("."));
}

/**
 * Esta pasta deve ser movida agora?
 *
 * Três "nãos" que valem mais que o sim:
 *  • o caminho foi MUDADO pela pessoa (não é o default antigo) — mexer nele
 *    seria desfazer uma escolha dela;
 *  • a origem não existe — não há o que mover;
 *  • o destino já existe — a migração já rodou, ou há coisa lá. Mover por
 *    cima podia sobrescrever conversa.
 */
export function shouldMigrate(p: {
  caminhoAtual: string;
  legado: string;
  novo: string;
  origemExiste: boolean;
  destinoExiste: boolean;
}): boolean {
  if (p.caminhoAtual !== p.legado) return false;
  if (!p.origemExiste) return false;
  if (p.destinoExiste) return false;
  return true;
}

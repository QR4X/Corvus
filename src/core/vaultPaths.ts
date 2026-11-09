export const CORVUS_HIDDEN = ".corvus";

export const CHATS_FOLDER = "corvus/chats";

export interface HiddenMove {

  legado: string;

  novo: string;

  campo: "chatsPath" | "ragIndexPath";
}

export const HIDDEN_MOVES: HiddenMove[] = [
  { legado: "corvus-ai/chats", novo: CHATS_FOLDER, campo: "chatsPath" },
  { legado: `${CORVUS_HIDDEN}/chats`, novo: CHATS_FOLDER, campo: "chatsPath" },
  { legado: "corvus-ai/index", novo: `${CORVUS_HIDDEN}/index`, campo: "ragIndexPath" },
];

export function isHiddenPath(path: string): boolean {
  return path.split("/").some((parte) => parte.startsWith("."));
}

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

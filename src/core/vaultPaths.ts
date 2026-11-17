export const CORVUS_HIDDEN = ".corvus";

export const CHATS_FOLDER = "corvus/chats";

export const SKILLS_FOLDER = "corvus-ai/skills";

export const GENERATION_FOLDER = "corvus-ai/generation";

export const IMAGE_GENERATION_FOLDER = `${GENERATION_FOLDER}/images`;

export const EXPORTS_FOLDER = "corvus-ai/exports";

export const REPORTS_FOLDER = "corvus-ai/reports";

export const INDEX_FOLDER = `${CORVUS_HIDDEN}/index`;

interface HiddenMove {

  legacy: string;

  target: string;

  field: "chatsPath" | "ragIndexPath";
}

export const HIDDEN_MOVES: HiddenMove[] = [
  { legacy: "corvus-ai/chats", target: CHATS_FOLDER, field: "chatsPath" },
  { legacy: `${CORVUS_HIDDEN}/chats`, target: CHATS_FOLDER, field: "chatsPath" },
  { legacy: "corvus-ai/index", target: INDEX_FOLDER, field: "ragIndexPath" },
];

export function shouldMigrate(p: {
  currentPath: string;
  legacy: string;
  target: string;
  sourceExists: boolean;
  targetExists: boolean;
}): boolean {
  if (p.currentPath !== p.legacy) return false;
  if (!p.sourceExists) return false;
  if (p.targetExists) return false;
  return true;
}

export function legacyModeMoves(
  appRoot: string,
  chatsFolder: string,
  modes: readonly string[]
): { from: string; to: string }[] {
  return modes
    .map((mode) => ({ from: `${appRoot}/${mode}`, to: `${chatsFolder}/${mode}` }))
    .filter((m) => m.from !== m.to);
}

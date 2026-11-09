import { createContext, useContext } from "react";
import type { ChatSummary } from "../core/chatPersistence";

export interface PainelApi {

  novoProjetoCom: (chatId: string) => void;

  escolherProjetoPara: (chatId: string) => void;

  instrucoesDe: (chat: ChatSummary) => void;
}

export const PainelCtx = createContext<PainelApi>({
  novoProjetoCom: () => {},
  escolherProjetoPara: () => {},
  instrucoesDe: () => {},
});

export function usePainel(): PainelApi {
  return useContext(PainelCtx);
}

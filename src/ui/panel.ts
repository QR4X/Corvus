import { createContext, useContext } from "react";
import type { ChatSummary } from "../core/chatPersistence";

interface PanelApi {

  newProjectWith: (chatId: string) => void;

  pickProjectFor: (chatId: string) => void;

  instructionsFor: (chat: ChatSummary) => void;
}

export const PanelCtx = createContext<PanelApi>({
  newProjectWith: () => {},
  pickProjectFor: () => {},
  instructionsFor: () => {},
});

export function usePanel(): PanelApi {
  return useContext(PanelCtx);
}

import { useEffect, useState } from "react";
import { Notice } from "obsidian";
import type CorvusPlugin from "../main";
import type { ChatSummary } from "../core/chatPersistence";
import { loadChat, setChatInstructions } from "../core/chatPersistence";
import { useChatStore } from "../store/chat";
import { Sheet } from "./Sheet";
import { SheetField, SheetSubmit, SheetTextarea } from "./SheetForm";
import { tr } from "../i18n/tr";

export async function loadInstructions(
  plugin: CorvusPlugin,
  chat: ChatSummary
): Promise<string | null> {
  const st = useChatStore.getState();
  if (st.currentChatId === chat.id) return st.sessionInstructions ?? "";
  try {
    const d = await loadChat(plugin.app, plugin.settings.chatsPath, chat.mode, chat.id);
    return d.instructions ?? "";
  } catch {
    return null;
  }
}

export function ChatInstructionsSheet({
  plugin,
  chat,
  open,
  onClose,
}: {
  plugin: CorvusPlugin;
  chat: ChatSummary | null;
  open: boolean;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [pronto, setPronto] = useState(false);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    if (!open || !chat) return;
    let vivo = true;
    setPronto(false);
    setUnreadable(false);
    void loadInstructions(plugin, chat).then((text) => {
      if (!vivo) return;
      if (text === null) {
        setUnreadable(true);
        return;
      }
      setTexto(text);
      setPronto(true);
    });
    return () => {
      vivo = false;
    };
  }, [open, chat?.id]);

  const salvar = async () => {
    if (!chat || !pronto) return;
    const limpo = texto.trim();
    try {
      await setChatInstructions(
        plugin.app,
        plugin.settings.chatsPath,
        chat.mode,
        chat.id,
        limpo
      );

      const st = useChatStore.getState();
      if (st.currentChatId === chat.id) st.setSessionInstructions(limpo);
      new Notice(
        limpo
          ? tr("Instructions saved for this chat.")
          : tr("Instructions removed from this chat.")
      );
      onClose();
    } catch (err) {
      new Notice(
        tr("Could not save the instructions: {error}", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  };

  return (
    <Sheet
      title={tr("Instructions")}
      mark={{ icon: "scroll-text" }}
      open={open}
      onClose={onClose}
      footer={
        <SheetSubmit
          label={tr("Save instructions")}
          problema={
            unreadable
              ? tr("Couldn't read this chat's instructions. Close and try again.")
              : pronto
                ? null
                : tr("Loading…")
          }
          onSubmit={() => void salvar()}
        />
      }
    >
      <SheetField
        label={chat ? chat.title || tr("Untitled") : ""}
        hint={tr(
          "Added to the assistant's own rules in every reply of this chat — like a project's instructions, they don't replace them. Leave it empty to remove."
        )}
      >
        <SheetTextarea
          value={texto}
          rows={8}
          placeholder={tr(
            "e.g. Answer in short bullet points and cite the note behind every claim."
          )}
          autoFocus={open && pronto}
          onChange={setTexto}
        />
      </SheetField>
    </Sheet>
  );
}

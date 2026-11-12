import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ClipboardEvent } from "react";
import {
  arrayBufferToBase64,
  Notice,
  Platform,
  requestUrl,
  type App,
} from "obsidian";
import type CorvusPlugin from "../main";
import {
  NEW_CHAT_DRAFT,
  useChatStore,
  type ActivityMeta,
  type ChatMessage,
} from "../store/chat";
import type { ChatSession } from "../core/session";
import {
  PROVIDERS,
  providerBlockedReason,
  providerHealth,
} from "../core/providersMeta";
import {
  getModelCard,
  prettyModelName,
} from "../providers/modelDescriptions";
import {
  EFFORT_LEVELS,
  EFFORT_LABELS,
  describeEffort,
  type EffortLevel,
} from "../core/effort";
import type { AIToolStep } from "../agent/types";
import { agentActivitySpec } from "../core/helpers";
import type { Skill } from "../skills/skills";
import { Markdown } from "./Markdown";
import { Icon } from "./Icon";
import { ImageModal } from "./ImageModal";
import { useVoice } from "./useVoice";
import { speak, stopSpeaking } from "./readAloud";
import { commit, screen, warn } from "./haptics";
import { composerMaxHeight, readKeyboardHeight } from "./composerSize";
import { decideScroll, shouldShowJump } from "./follow";
import { pasteIsBig, pastedNote } from "./pasteAttachment";
import {
  htmlTitle,
  htmlToText,
  isImageExt,
  linkNote,
  normalizeUrl,
  rankArtifacts,
  vaultArtifacts,
  attachmentLabel,
  attachmentThumb,
  artifactIcon,
  GENERATION_DIR,
  type ArtifactLike,
} from "./attachSources";
import { getModelCapabilities } from "../providers/modelCapabilities";
import { getTranscriptionCredential } from "../providers/transcribe";
import { ConfirmModal, PromptModal, openPluginSettings } from "./modals";
import { desfaziveis, desfazerRodada, desfazerUma, idDesfazivel } from "./agentUndo";
import { VoiceDock } from "./VoiceBar";
import {
  Sheet,
  SheetGroup,
  SheetNavRow,
  SheetToggleRow,
  SheetNote,
  SheetRow,
  SheetSearch,
  SheetTabs,
  SheetSeg,
  SheetTile,
  SheetTiles,
} from "./Sheet";
import { modelLogo } from "../providers/modelLogo";
import {
  rankNotes,
  readNote,
  notaAberta,
  vaultNotes,
  wikilinkQuery,
  type NoteLike,
} from "./notePicker";
import { StarterScreen } from "./StarterScreen";
import { ThinkingLine } from "./Thinking";
import type { ComposerInject } from "./App";
import { moduleFabLabel, moduleLabel, modulePlaceholder } from "./modules";
import { filterModels, groupModels, mergeModelOptions } from "./modelGroups";

import { FAVORITE_LIMIT } from "./SettingsTab";
import { texto } from "../core/text";
import { uiLocale, mark, tr } from "../i18n/tr";

const PLUS_SHEET_TITLE: Record<string, string> = {
  root: mark("Add context"),
  notes: mark("Attach note"),
  skills: mark("Use a skill"),
  artifacts: mark("Attach artifact"),
};

const MODEL_SHEET_TITLE: Record<string, string> = {
  root: mark("Select model"),
  list: mark("All models"),
  effort: mark("Effort"),
};

export function ChatView({
  plugin,
  session,
  inject,
  onBackHome,
  onUseSkill,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  inject: ComposerInject | null;

  onBackHome: () => void;
  onUseSkill: (skill: Skill) => void;
}) {
  const messages = useChatStore((s) => s.messages);

  const respondendoAlguem = useChatStore((s) => s.isLoading);
  const turnChatId = useChatStore((s) => s.turnChatId);
  const loadingChat = useChatStore((s) => s.loadingChat);
  const streamingId = useChatStore((s) => s.streamingMessageId);
  const currentChatId = useChatStore((s) => s.currentChatId);

  const isLoading = respondendoAlguem && turnChatId === currentChatId;

  const outraRespondendo = respondendoAlguem && !isLoading;

  const currentChatTitle = useChatStore((s) => s.currentChatTitle);

  const attachments = useChatStore((s) => s.attachments);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const removeAttachment = useChatStore((s) => s.removeAttachment);

  const queued = useChatStore((s) => s.queued);
  const pushQueued = useChatStore((s) => s.pushQueued);
  const removeQueued = useChatStore((s) => s.removeQueued);

  const locked = useChatStore((s) => s.sessionProvider) !== null;
  const cfg = session.config;

  const draftKey = currentChatId ?? NEW_CHAT_DRAFT;
  const draft = useChatStore((s) => s.drafts[draftKey] ?? "");
  const writeDraft = useChatStore((s) => s.setDraft);
  const setDraft = useCallback(
    (next: string | ((prev: string) => string)) =>
      writeDraft(
        draftKey,
        typeof next === "function"
          ? next(useChatStore.getState().drafts[draftKey] ?? "")
          : next
      ),
    [draftKey, writeDraft]
  );

  const [sheet, setSheet] = useState<"model" | "effort" | "plus" | null>(
    null
  );

  const [pickProvider, setPickProvider] = useState(cfg.provider);

  const [modelQuery, setModelQuery] = useState("");

  const [modelTab, setModelTab] = useState("");
  const [modelView, setModelView] = useState<"root" | "list" | "effort">(
    "root"
  );

  const [liveText, setLiveText] = useState("");

  const [mention, setMention] = useState<{ start: number; query: string } | null>(
    null
  );

  const [plusView, setPlusView] = useState<
    "root" | "notes" | "skills" | "artifacts"
  >("root");
  const [noteQuery, setNoteQuery] = useState("");

  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const [tools, setTools] = useState<TurnAction[] | null>(null);
  const [toolAt, setToolAt] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLElement>(null);

  const publicarRef = useRef<(() => void) | null>(null);

  const focoAntesDaFolha = useRef(false);

  const medindoRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!inject) return;
    if (inject.text) {
      setDraft((d) => (d.trim() ? `${d}\n\n${inject.text}` : inject.text));
    }
    textareaRef.current?.focus({ preventScroll: true });
  }, [inject]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const fit = () => {
      const max = composerMaxHeight(
        window.innerHeight,
        readKeyboardHeight(document),
        window.visualViewport?.height
      );

      el.style.setProperty("--corvus-composer-max", `${max}px`);

      el.setCssStyles({ height: "0px" });
      el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    };

    if (!el.style.height) fit();
    else if (!medindoRef.current) {
      medindoRef.current = window.requestAnimationFrame(() => {
        medindoRef.current = 0;
        fit();
      });
    }
    const vv = window.visualViewport;
    window.addEventListener("resize", fit);
    vv?.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      vv?.removeEventListener("resize", fit);
    };
  }, [draft]);

  useEffect(
    () => () => {
      if (medindoRef.current) window.cancelAnimationFrame(medindoRef.current);
    },
    []
  );

  const { hiddenIds, actionsByResponse } = useMemo(() => {
    const hiddenIds = new Set<string>();
    const actionsByResponse = new Map<string, TurnAction[]>();
    let bucket: ChatMessage[] = [];
    for (const m of messages) {
      if (m.type === "ai-comment" && m.activity) {
        bucket.push(m);
        hiddenIds.add(m.id);
        continue;
      }
      if (m.type === "ai-response") {
        const narradas: TurnAction[] = bucket
          .map((c): TurnAction | null =>
            c.type === "ai-comment" && c.activity
              ? { kind: "activity", activity: c.activity }
              : null
          )
          .filter((a): a is TurnAction => a !== null);
        const passos: TurnAction[] = (m.agentSteps ?? []).map((step) => ({
          kind: "step",
          step,
        }));
        const todas = [...narradas, ...passos];
        if (todas.length > 0) actionsByResponse.set(m.id, todas);
        for (const c of bucket) hiddenIds.add(c.id);
        bucket = [];
      } else if (m.type === "user") {
        bucket = [];
      }
    }
    return { hiddenIds, actionsByResponse };
  }, [messages]);

  const liveTurn = useMemo(() => {
    const bucket: TurnAction[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === "ai-response" || m.type === "user") break;
      if (m.type === "ai-comment" && m.activity) {
        bucket.unshift({ kind: "activity", activity: m.activity });
      }
    }
    return bucket;
  }, [messages]);
  const pendingActivity = [...liveTurn]
    .reverse()
    .find(
      (action): action is Extract<TurnAction, { kind: "activity" }> =>
        action.kind === "activity" && action.activity.phase === "pending"
    )?.activity;

  const ultima = messages[messages.length - 1];
  const jaEscrevendo =
    ultima?.type === "ai-response" &&
    ultima.id === streamingId &&
    ultima.content.length > 0;
  const pensandoAgora = (isLoading || liveTurn.length > 0) && !jaEscrevendo;

  const desdeRef = useRef(0);
  if (pensandoAgora && desdeRef.current === 0) desdeRef.current = Date.now();
  if (!pensandoAgora && desdeRef.current !== 0) desdeRef.current = 0;
  const pensandoDesde = desdeRef.current || Date.now();

  const [seguindo, setSeguindo] = useState(true);

  const seguindoRef = useRef(true);
  seguindoRef.current = seguindo;

  const [avisoId, setAvisoId] = useState<string | null>(null);

  const alturaAnteriorRef = useRef(0);

  const gestoRef = useRef(false);

  const stickToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const retomarRef = useRef<
    | { scroll: number; desde: number }
    | { messageId: string; desde: number }
    | null
  >(null);

  const RETOMAR_MS = 1500;

  const aplicarRetomada = () => {
    const alvo = retomarRef.current;
    const el = scrollRef.current;
    if (!alvo || !el) return false;
    const desistiu = Date.now() - alvo.desde > RETOMAR_MS;
    if ("messageId" in alvo) {
      const msg = el.querySelector<HTMLElement>(`[data-msg="${alvo.messageId}"]`);
      if (!msg) {
        if (!desistiu) return false;
        retomarRef.current = null;
        return false;
      }

      const destino = Math.max(0, msg.offsetTop - 12);
      el.scrollTop = destino;

      if (!desistiu && Math.abs(el.scrollTop - destino) > 2) return false;
    } else {
      const destino = alvo.scroll;
      el.scrollTop = destino;
      if (!desistiu && Math.abs(el.scrollTop - destino) > 2) return false;
    }
    retomarRef.current = null;
    alturaAnteriorRef.current = el.scrollHeight;
    seguindoRef.current = false;
    setSeguindo(false);
    return true;
  };

  const reavaliar = () => {
    const el = scrollRef.current;
    if (!el) return;

    if (retomarRef.current) {
      aplicarRetomada();
      alturaAnteriorRef.current = el.scrollHeight;
      return;
    }
    const { pin, seguindo: noFim } = decideScroll({
      gesto: gestoRef.current,
      alturaAnterior: alturaAnteriorRef.current,
      alturaAtual: el.scrollHeight,
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
    });
    if (pin) el.scrollTop = el.scrollHeight;
    alturaAnteriorRef.current = el.scrollHeight;
    if (noFim !== seguindoRef.current) {
      seguindoRef.current = noFim;
      setSeguindo(noFim);
    }
    if (noFim) setAvisoId(null);
  };

  const voltarPraBaixo = () => {

    retomarRef.current = null;
    gestoRef.current = false;
    seguindoRef.current = true;
    setSeguindo(true);
    setAvisoId(null);
    stickToBottom();
    const el = scrollRef.current;
    if (el) alturaAnteriorRef.current = el.scrollHeight;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    alturaAnteriorRef.current = el.scrollHeight;

    const obs = new MutationObserver(reavaliar);
    obs.observe(el, { childList: true, subtree: true, characterData: true });

    let assentar = 0;
    const comecarGesto = () => {
      gestoRef.current = true;
      window.clearTimeout(assentar);
      assentar = 0;
    };
    const terminarGesto = () => {
      window.clearTimeout(assentar);
      assentar = window.setTimeout(() => {
        assentar = 0;
        gestoRef.current = false;
        reavaliar();
      }, 320);
    };
    const aoRolar = () => {

      useChatStore.setState({
        viewScrollTop: el.scrollTop,
        viewChatId: useChatStore.getState().currentChatId,
      });

      if (assentar) terminarGesto();
      reavaliar();
    };

    const captura = { passive: true, capture: true } as const;
    el.addEventListener("scroll", aoRolar, { passive: true });
    el.addEventListener("touchstart", comecarGesto, captura);
    el.addEventListener("touchend", terminarGesto, captura);
    el.addEventListener("touchcancel", terminarGesto, captura);
    el.addEventListener("wheel", comecarGesto, captura);
    el.addEventListener("wheel", terminarGesto, captura);
    const mouseDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") comecarGesto();
    };
    const mouseUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") terminarGesto();
    };
    el.addEventListener("pointerdown", mouseDown, captura);
    window.addEventListener("pointerup", mouseUp);

    return () => {
      obs.disconnect();
      window.clearTimeout(assentar);
      el.removeEventListener("scroll", aoRolar);
      el.removeEventListener("touchstart", comecarGesto, captura);
      el.removeEventListener("touchend", terminarGesto, captura);
      el.removeEventListener("touchcancel", terminarGesto, captura);
      el.removeEventListener("wheel", comecarGesto, captura);
      el.removeEventListener("wheel", terminarGesto, captura);
      el.removeEventListener("pointerdown", mouseDown, captura);
      window.removeEventListener("pointerup", mouseUp);
    };
  }, []);

  useEffect(reavaliar, [messages, streamingId]);

  useEffect(() => {
    const el = composerRef.current;
    const raiz = el?.closest(".corvus-root") as HTMLElement | null;
    if (!el || !raiz) return;
    const publicar = () => {

      raiz.style.setProperty(
        "--corvus-composer-h",
        `${Math.max(0, Math.round(el.getBoundingClientRect().height))}px`
      );

      reavaliar();
    };
    publicarRef.current = publicar;
    publicar();
    const obs = new ResizeObserver(publicar);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useLayoutEffect(() => {
    publicarRef.current?.();
  });

  useEffect(() => {

    const { resumeScroll, resumeMessageId } = useChatStore.getState();
    if (resumeScroll !== null || resumeMessageId !== null) {
      useChatStore.getState().setResume({});
      gestoRef.current = false;
      setAvisoId(null);
      seguindoRef.current = false;
      setSeguindo(false);
      retomarRef.current =
        resumeMessageId !== null
          ? { messageId: resumeMessageId, desde: Date.now() }
          : { scroll: resumeScroll as number, desde: Date.now() };

      window.requestAnimationFrame(() => aplicarRetomada());
      return;
    }

    const { viewChatId, viewScrollTop } = useChatStore.getState();
    if (currentChatId && viewChatId === currentChatId && viewScrollTop > 0) {
      gestoRef.current = false;
      setAvisoId(null);
      seguindoRef.current = false;
      setSeguindo(false);
      retomarRef.current = { scroll: viewScrollTop, desde: Date.now() };
      window.requestAnimationFrame(() => aplicarRetomada());
      return;
    }
    retomarRef.current = null;
    voltarPraBaixo();
  }, [currentChatId]);

  const respondendoRef = useRef(false);
  useEffect(() => {
    const respondendoAgora = isLoading || streamingId !== null;
    const terminou = respondendoRef.current && !respondendoAgora;
    respondendoRef.current = respondendoAgora;
    if (!terminou) return;
    if (seguindoRef.current) return;
    const ultima = [...messages]
      .reverse()
      .find((m) => m.type === "ai-response");
    if (!ultima) return;
    setAvisoId(ultima.id);

    commit();
  }, [isLoading, streamingId, messages]);

  const mostrarAviso = shouldShowJump(
    seguindo,
    isLoading || streamingId !== null,
    avisoId !== null
  );

  const onComposerFocus = () => {
    if (!seguindoRef.current) return;
    stickToBottom();
    window.setTimeout(stickToBottom, 350);
  };

  const conferirMencao = (el: HTMLTextAreaElement) => {
    const achou = wikilinkQuery(el.value, el.selectionStart ?? el.value.length);
    setMention(achou);
  };

  const escolherMencao = (n: NoteLike) => {
    const el = textareaRef.current;
    if (!el || !mention) return;
    const cursor = el.selectionStart ?? draft.length;
    const link = `[[${n.path.replace(/\.md$/, "")}]]`;
    const antes = draft.slice(0, mention.start);
    const novo = antes + link + draft.slice(cursor);
    setDraft(novo);
    setMention(null);
    void anexarNota(n.path);

    const fim = antes.length + link.length;
    window.setTimeout(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(fim, fim);
    }, 0);
  };

  const aoTocarBloqueado = async (
    id: string,
    motivo: string,
    insistiu: boolean
  ) => {
    const nome = PROVIDERS.find((p) => p.id === id)?.name ?? id;
    if (!insistiu) {
      new Notice(`${nome} — ${tr(motivo)}`);
      return;
    }
    const ir = await new ConfirmModal(plugin.app, {
      title: tr("{name} is not set up", { name: nome }),
      body: `${tr(motivo)}

${tr("Open Settings › Providers to add it, then run the connection test.")}`,
      confirmLabel: tr("Open settings"),
    }).openAndWait();
    if (ir) {
      closeSheet();
      openPluginSettings(plugin);
    }
  };

  const anexarPdf = (file: File) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const dataUrl = texto(leitor.result);
      if (!dataUrl.startsWith("data:")) return;
      addAttachment({ type: "pdf", name: file.name, dataUrl });
    };
    leitor.onerror = () => new Notice(tr("Could not read that file."));
    leitor.readAsDataURL(file);
  };

  const anexarLink = async () => {
    const digitado = await new PromptModal(plugin.app, {
      title: tr("Attach link"),
      label: tr("Address"),
      placeholder: "https://…",
      submitLabel: tr("Fetch"),
    }).openAndWait();
    const url = normalizeUrl(digitado ?? "");
    if (!url) {
      if (digitado) new Notice(tr("That doesn't look like an address."));
      return;
    }
    const aviso = new Notice(tr("Fetching {url}…", { url }), 0);
    try {

      const res = await requestUrl({ url });
      const texto = htmlToText(res.text ?? "");
      if (!texto) {
        new Notice(tr("Nothing readable at that address."));
        return;
      }
      addAttachment(linkNote(url, htmlTitle(res.text ?? ""), texto));
    } catch {
      new Notice(tr("Could not reach that address."));
    } finally {
      aviso.hide();
    }
  };

  const anexarArtefato = async (a: ArtifactLike) => {
    try {
      if (isImageExt(a.extension) && modeloVeImagem) {
        const bin = await plugin.app.vault.adapter.readBinary(a.path);
        const mime = a.extension.toLowerCase() === "png" ? "image/png" : "image/jpeg";
        addAttachment({
          type: "image",
          dataUrl: `data:${mime};base64,${arrayBufferToBase64(bin)}`,
          mimeType: mime,
          name: `${a.basename}.${a.extension}`,
        });
        return;
      }
      addAttachment({
        type: "note",
        path: a.path,
        content: `File generated by plugin: ${a.path}`,
      });
    } catch {
      new Notice(tr("Could not read that file."));
    }
  };

  const aoColar = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const dados = e.clipboardData;
    if (!dados) return;

    const textoColado = dados.getData("text");

    const imagens = Array.from(dados.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (imagens.length > 0) {
      e.preventDefault();
      if (!modeloVeImagem) {
        new Notice(tr("This model can't read images."));
        return;
      }
      for (const img of imagens) anexarImagem(img);
      return;
    }

    if (pasteIsBig(textoColado)) {
      e.preventDefault();
      addAttachment(pastedNote(textoColado));
    }
  };

  const anexarNota = async (path: string) => {
    const nota = await readNote(plugin.app, path);
    if (!nota) {
      new Notice(tr("Note not found: {path}", { path }));
      return;
    }
    addAttachment({ type: "note", path: nota.path, content: nota.content });
  };

  const anexarImagem = (file: File) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const dataUrl = texto(leitor.result);
      if (!dataUrl.startsWith("data:")) return;
      addAttachment({
        type: "image",
        dataUrl,
        mimeType: file.type || undefined,
        name: file.name,
      });
    };
    leitor.onerror = () => new Notice(tr("Could not read that image."));
    leitor.readAsDataURL(file);
  };

  const abrirAcoes = useCallback((acoes: TurnAction[]) => {
    setTools(acoes);

    setToolAt(acoes.length === 1 ? 0 : null);
  }, []);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;

    voltarPraBaixo();

    if (outraRespondendo) {

      new Notice(tr("Another chat is still answering — try again in a moment."));
      return;
    }
    if (isLoading) {
      commit();
      pushQueued(text);
      writeDraft(draftKey, "");
      return;
    }
    commit();

    const chave = draftKey;

    writeDraft(chave, "");
    const foi = await session.send(text);

    if (!foi && !(useChatStore.getState().drafts[chave] ?? "").trim()) {
      writeDraft(chave, text);
    }
  };

  const openSheet = (which: "model" | "effort" | "plus") => {
    const campo = textareaRef.current;
    focoAntesDaFolha.current =
      campo != null && campo.ownerDocument.activeElement === campo;
    textareaRef.current?.blur();

    if (which === "model") {
      setPickProvider(cfg.provider);
      setModelView("root");

      setModelQuery("");
      setModelTab("");
    }
    if (which === "plus") {
      setPlusView("root");
      setNoteQuery("");
    }
    setSheet(which);
  };
  const closeSheet = () => {
    setSheet(null);

    if (focoAntesDaFolha.current) {
      focoAntesDaFolha.current = false;
      window.setTimeout(
        () => textareaRef.current?.focus({ preventScroll: true }),
        0
      );
    }
  };

  const notasAchadas = useMemo(() => {
    if (sheet !== "plus" || plusView !== "notes") return [];
    return rankNotes(vaultNotes(plugin.app), noteQuery);
  }, [sheet, plusView, noteQuery, plugin.app]);

  const mentionHits = useMemo(
    () => (mention ? rankNotes(vaultNotes(plugin.app), mention.query, 6) : []),
    [mention, plugin.app]
  );

  const caps = getModelCapabilities(cfg.provider, cfg.model);
  const modeloVeImagem =
    caps.vision ||
    getModelCard(cfg.provider, cfg.model).category === "chat-vision";
  const modeloLePdf = caps.pdf === true;

  const artefatos = useMemo(() => {
    if (sheet !== "plus" || plusView !== "artifacts") return [];
    return rankArtifacts(vaultArtifacts(plugin.app));
  }, [sheet, plusView, plugin.app]);

  const favorites = (
    plugin.settings.favoriteModels?.[pickProvider] ?? []
  ).slice(0, 5);

  const ativosDoProvider = session.modelOptions(pickProvider);
  const catalogoDoProvider = plugin.settings.discoveredModels?.[pickProvider] ?? [];
  const todosOsModelos = mergeModelOptions(ativosDoProvider, catalogoDoProvider);
  const rest = todosOsModelos.filter((m) => !favorites.includes(m));

  const voice = useVoice({
    apiKey: () => {
      const cred = getTranscriptionCredential(plugin.settings);
      return cred?.apiKey ?? "";
    },
    model: () => plugin.settings.voiceModel,
    language: () => plugin.settings.voiceLanguage,
    onTranscript: setLiveText,

    onFinal: (texto) => {
      setLiveText("");
      if (!texto) return;
      setDraft((d) => (d.trim() ? `${d.trim()} ${texto}` : texto));
    },
    onNotice: (m) => {
      new Notice(m);
    },
    onCancel: () => setLiveText(""),
  });

  const [arming, setArming] = useState(false);
  const startVoice = async () => {
    if (arming || voice.state !== "idle") return;
    setLiveText("");
    setArming(true);
    screen();
    const ok = await voice.start();
    if (!ok) {
      setArming(false);
      warn();
    }
  };
  useEffect(() => {
    if (voice.state === "idle") setArming(false);
  }, [voice.state]);

  useEffect(() => {
    setModelQuery("");
    setModelTab("");
  }, [modelView]);

  const catalogosTentados = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (sheet !== "model") return;
    if (plugin.settings.discoveredModels?.[pickProvider]) return;
    if (!plugin.providerCredential(pickProvider)) return;
    if (catalogosTentados.current.has(pickProvider)) return;
    catalogosTentados.current.add(pickProvider);

    void plugin.scanModels(pickProvider).catch(() => {});
  }, [sheet, pickProvider, plugin]);

  const alternarFavorito = async (model: string) => {
    const atuais = plugin.settings.favoriteModels?.[pickProvider] ?? [];
    const tem = atuais.includes(model);
    if (!tem && atuais.length >= FAVORITE_LIMIT) {
      new Notice(
        tr("{n} favorites per provider is the limit — unstar one first.", {
          n: FAVORITE_LIMIT,
        })
      );
      return;
    }
    plugin.settings.favoriteModels = {
      ...(plugin.settings.favoriteModels ?? {}),
      [pickProvider]: tem
        ? atuais.filter((x) => x !== model)
        : [...atuais, model],
    };
    await plugin.saveSettings();
  };

  const chooseModel = (model: string) => {
    session.selectModel(pickProvider, model);
    closeSheet();
  };

  const empty = messages.length === 0 && !loadingChat;
  const effort = cfg.effort as EffortLevel;

  return (
    <div className="corvus-chat">
      <header className="corvus-topbar">
        {}
        <button
          type="button"
          className="corvus-icon-btn"
          aria-label={tr("Back")}
          onClick={onBackHome}
        >
          <Icon name="arrow-left" />
        </button>
        <div className="corvus-topbar-title">
          <span className="corvus-topbar-name">
            {}
            {currentChatId
              ? currentChatTitle || tr("Untitled")
              : tr(moduleFabLabel(cfg.mode))}
          </span>
          {locked && (
            <span className="corvus-topbar-meta">
              {tr(moduleLabel(cfg.mode))} · {cfg.model}
            </span>
          )}
        </div>
        <button
          type="button"
          className="corvus-icon-btn"
          aria-label={tr("New chat")}
          disabled={empty && !currentChatId}
          onClick={() => session.newChat()}
        >
          <Icon name="square-pen" />
        </button>
      </header>

      <div className="corvus-messages" ref={scrollRef}>
        {loadingChat && <p className="corvus-empty-line">{tr("Loading…")}</p>}
        {empty ? (
          <StarterScreen plugin={plugin} session={session} />
        ) : (
          messages
            .filter((m) => !hiddenIds.has(m.id))
            .map((m) => (
            <MessageRow
              key={m.id}
              msg={m}
              plugin={plugin}
              streaming={m.id === streamingId}
              glow={m.id === avisoId}
              actions={actionsByResponse.get(m.id)}
              onOpenTools={abrirAcoes}
              idioma={uiLocale()}
            />
          ))
        )}

        {}
        {pensandoAgora && (
          <ThinkingLine
            count={liveTurn.length}
            since={pensandoDesde}
            activity={pendingActivity}
            onOpen={() => {
              if (liveTurn.length === 0) return;
              setTools(liveTurn);
              setToolAt(liveTurn.length === 1 ? 0 : null);
            }}
          />
        )}
      </div>

      {}
      <section className="corvus-composer" ref={composerRef}>
          {}
          {mostrarAviso && (
            <button
              type="button"
              className={avisoId ? "corvus-jump is-done" : "corvus-jump"}
              onClick={voltarPraBaixo}
            >
              <Icon name="arrow-down" size={15} />
              {avisoId ? tr("Answer ready") : tr("Jump to latest")}
            </button>
          )}
          {}
          {mention && mentionHits.length > 0 && (
            <div className="corvus-mention">
              {mentionHits.map((n) => (
                <button
                  key={n.path}
                  type="button"
                  className="corvus-mention-row"

                  onMouseDown={(e) => {
                    e.preventDefault();
                    escolherMencao(n);
                  }}
                >
                  <Icon name="file-text" size={15} />
                  <span className="corvus-mention-name">{n.basename}</span>
                  <span className="corvus-mention-path">{n.path}</span>
                </button>
              ))}
            </div>
          )}
          {}
          {}
          {(attachments.length > 0 || queued.length > 0) && (
            <div className="corvus-pills-row">
              {queued.map((q, i) => (
                <span className="corvus-pill-chip is-queued" key={`q${i}`}>
                  <Icon name="clock" size={14} />
                  <span className="corvus-pill-chip-label">{q}</span>
                  <button
                    type="button"
                    className="corvus-pill-chip-x"
                    aria-label={tr("Cancel queued message")}
                    onClick={() => {
                      removeQueued(i);
                      setDraft((d) => (d.trim() ? d : q));
                    }}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </span>
              ))}
              {attachments.map((a, i) => {
                const thumb = attachmentThumb(a);
                return (
                  <span className="corvus-pill-chip" key={`a${i}`}>
                    {thumb.kind === "image" ? (
                      <img
                        className="corvus-pill-chip-thumb"
                        src={thumb.url}
                        alt=""
                      />
                    ) : (
                      <span className="corvus-pill-chip-emoji" aria-hidden="true">
                        {thumb.char}
                      </span>
                    )}
                    <span className="corvus-pill-chip-label">
                      {attachmentLabel(a)}
                    </span>
                    <button
                      type="button"
                      className="corvus-pill-chip-x"
                      aria-label={tr("Remove attachment")}
                      onClick={() => removeAttachment(i)}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div
            className="corvus-swap"
            data-mode={voice.state !== "idle" || arming ? "voice" : "text"}
          >
            <div className="corvus-swap-row">
            <div className="corvus-input">
              {}
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                placeholder={tr(modulePlaceholder(cfg.mode))}
                onFocus={onComposerFocus}
                onChange={(e) => {
                  setDraft(e.currentTarget.value);
                  conferirMencao(e.currentTarget);
                }}
                onSelect={(e) => conferirMencao(e.currentTarget)}
                onPaste={aoColar}
                onBlur={() => setMention(null)}
                onKeyDown={(e) => {

                  if (e.key === "Escape" && mention) {
                    e.preventDefault();
                    setMention(null);
                    return;
                  }
                  if (e.key !== "Enter") return;

                  if (mention && mentionHits.length > 0) {
                    e.preventDefault();
                    escolherMencao(mentionHits[0]);
                    return;
                  }
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    void submit();
                    return;
                  }

                  if (e.nativeEvent.isComposing) return;

                  if (!Platform.isMobile && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />

              {}
              <div className="corvus-input-bar">
                <button
                  type="button"
                  className="corvus-round-btn"
                  aria-label={tr("Add to chat")}
                  onClick={() => openSheet("plus")}
                >
                  <Icon name="plus" size={22} />
                </button>
                {}
                <input
                  ref={imageRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (f) anexarImagem(f);
                    e.currentTarget.value = "";
                  }}
                />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (f) anexarImagem(f);
                    e.currentTarget.value = "";
                  }}
                />
                <input
                  ref={pdfRef}
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (f) anexarPdf(f);
                    e.currentTarget.value = "";
                  }}
                />

                <div className="corvus-pills">
                  <Pill
                    label={prettyModelName(cfg.model) || tr("no model")}
                    logo={
                      PROVIDERS.find((p) => p.id === cfg.provider)?.icon
                    }
                    onClick={() => openSheet("model")}
                  />
                </div>

                {plugin.settings.voiceEnabled && (
                  <button
                    type="button"
                    className="corvus-round-btn"
                    aria-label={tr("Voice mode")}
                    onClick={() => void startVoice()}
                  >
                    <Icon name="mic" size={20} />
                  </button>
                )}

                {isLoading ? (
                  <>
                    {}
                    {draft.trim() && (
                      <button
                        type="button"
                        className="corvus-round-btn"
                        aria-label={tr("Send when this finishes")}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => void submit()}
                      >
                        <Icon name="arrow-up" size={20} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="corvus-send is-stop"
                      aria-label={tr("Stop")}
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => session.stop()}
                    >
                      <Icon name="square" size={18} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="corvus-send"
                    aria-label={tr("Send")}
                    disabled={!draft.trim()}

                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => void submit()}
                  >
                    <Icon name="arrow-up" size={20} />
                  </button>
                )}
              </div>
            </div>
            </div>

            <div className="corvus-swap-row">
              <div className="corvus-voice-side">
                {liveText && <p className="corvus-voice-live">{liveText}</p>}
                <VoiceDock voice={voice} />
              </div>
            </div>
          </div>
      </section>

      {}
      {}
      <Sheet
        title={tr(MODEL_SHEET_TITLE[modelView])}
        open={sheet === "model"}
        onClose={closeSheet}
        onBack={modelView === "root" ? undefined : () => setModelView("root")}
      >
        {modelView === "root" && (
          <SheetSeg
            label={tr("Provider")}
            activeId={pickProvider}
            onPick={setPickProvider}
            onBlocked={(id, motivo, insistiu) =>
              void aoTocarBloqueado(id, motivo, insistiu)
            }
            items={PROVIDERS.map((p) => ({
              id: p.id,
              icon: p.icon,
              label: p.name,
              health: providerHealth(plugin, p.id),
              blocked: providerBlockedReason(plugin, p.id),
            }))}
          />
        )}

        {}
        {modelView === "root" && (
          <SheetSearch
            value={modelQuery}
            placeholder={tr("Search models")}

            found={
              modelQuery.trim()
                ? filterModels(todosOsModelos, modelQuery, prettyModelName).length
                : undefined
            }
            onChange={setModelQuery}
          />
        )}

        {modelView === "effort" ? (
          <SheetGroup>
            {EFFORT_LEVELS.map((l) => (
              <SheetRow
                key={l}
                title={tr(EFFORT_LABELS[l])}
                note={describeEffort(l, plugin.settings.effortConfigs)}
                tag={l === plugin.settings.defaultEffort ? tr("Default") : undefined}
                selected={l === cfg.effort}
                onClick={() => {
                  session.setEffort(l);
                  closeSheet();
                }}
              />
            ))}
          </SheetGroup>
        ) : modelView === "list" ||
          (modelView === "root" && modelQuery.trim().length > 0) ? (
          <ListaDeModelos
            provider={pickProvider}

            models={ativosDoProvider}
            catalogo={catalogoDoProvider}
            atual={pickProvider === cfg.provider ? cfg.model : ""}
            query={modelQuery}
            onQuery={setModelQuery}
            aba={modelTab}
            onAba={setModelTab}
            favoritos={favorites}
            onFavorito={(m) => void alternarFavorito(m)}
            onPick={chooseModel}

            busca={modelView !== "root"}
          />
        ) : (
          <>
            {favorites.length > 0 ? (

              <SheetGroup>
                {favorites.map((m) => (
                  <ModelRow
                    key={m}
                    provider={pickProvider}
                    model={m}
                    selected={m === cfg.model && pickProvider === cfg.provider}
                    favorito
                    onFavorito={() => void alternarFavorito(m)}
                    onClick={() => chooseModel(m)}
                  />
                ))}
              </SheetGroup>
            ) : (
              <SheetGroup>
                <SheetNote>
                  {rest.length > 0
                    ? tr(
                        "No favorites for this provider yet — star up to {n} in Settings › Providers, or open the full list below.",
                        { n: FAVORITE_LIMIT }
                      )
                    : tr(
                        "Nothing marked to show for this provider yet — pick what appears here in Settings → Providers."
                      )}
                </SheetNote>
              </SheetGroup>
            )}
            {}
            <SheetGroup>
              {}
              {rest.length > 0 && (
                <SheetNavRow
                  icon="list"
                  title={tr("All models")}
                  note={`${todosOsModelos.length}`}
                  onClick={() => setModelView("list")}
                />
              )}
              <SheetNavRow
                icon="timer"
                title={tr("Effort")}
                note={tr(EFFORT_LABELS[effort] ?? cfg.effort)}
                onClick={() => setModelView("effort")}
              />
              {}
              <SheetToggleRow
                icon="library"
                title={tr("Use my notes")}
                note={cfg.vault ? tr("On") : tr("Off")}
                on={cfg.vault}
                onToggle={(on) => session.setVault(on)}
              />
            </SheetGroup>
          </>
        )}
      </Sheet>

      {}
      {}
      <Sheet
        title={tr(PLUS_SHEET_TITLE[plusView])}
        open={sheet === "plus"}
        onClose={closeSheet}
        onBack={plusView === "root" ? undefined : () => setPlusView("root")}
      >
        {plusView === "notes" ? (
          <>
            <SheetSearch
              value={noteQuery}
              placeholder={tr("Search notes")}
              found={notasAchadas.length}
              autoFocus
              onChange={setNoteQuery}
            />
            <SheetGroup>
              {notasAchadas.map((n) => (
                <SheetRow
                  key={n.path}
                  dense
                  icon="file-text"
                  title={n.basename}
                  note={n.path}
                  onClick={() => {
                    void anexarNota(n.path);
                    closeSheet();
                  }}
                />
              ))}
              {notasAchadas.length === 0 && (
                <SheetNote>{tr("No note matches that.")}</SheetNote>
              )}
            </SheetGroup>
          </>
        ) : plusView === "skills" ? (
          <SheetGroup>
            {plugin.skills.map((sk) => (
              <SheetRow
                key={sk.id}
                title={sk.name}
                note={sk.description}
                onClick={() => {
                  onUseSkill(sk);
                  closeSheet();
                }}
              />
            ))}
            {plugin.skills.length === 0 && (
              <SheetNote>
                {tr(
                  "No skills yet — they live as notes in your vault, and show up here once you create one."
                )}
              </SheetNote>
            )}
          </SheetGroup>
        ) : plusView === "artifacts" ? (
          <SheetGroup>
            {artefatos.map((a) => (
              <SheetRow
                key={a.path}
                dense
                icon={artifactIcon(a.extension)}
                title={a.basename}
                note={a.path}
                onClick={() => {
                  void anexarArtefato(a);
                  closeSheet();
                }}
              />
            ))}
            {artefatos.length === 0 && (
              <SheetNote>
                {tr(
                  "Nothing generated yet — images, audio and video made here land in {folder} and show up in this list.",
                  { folder: GENERATION_DIR }
                )}
              </SheetNote>
            )}
          </SheetGroup>
        ) : (
          <>
            <SheetTiles>
              <SheetTile
                icon="file-text"
                label={tr("Notes")}
                onClick={() => {
                  setNoteQuery("");
                  setPlusView("notes");
                }}
              />
              <SheetTile
                icon="camera"
                label={tr("Camera")}
                disabled={!modeloVeImagem}
                hint={modeloVeImagem ? undefined : tr("unavailable")}
                onClick={() => {
                  closeSheet();
                  cameraRef.current?.click();
                }}
              />
              <SheetTile
                icon="image"
                label={tr("Image")}
                disabled={!modeloVeImagem}
                hint={modeloVeImagem ? undefined : tr("unavailable")}
                onClick={() => {
                  closeSheet();
                  imageRef.current?.click();
                }}
              />
            </SheetTiles>

            <SheetGroup>
              {}
              {(() => {
                const aberta = sheet === "plus" ? notaAberta(plugin.app) : null;
                if (!aberta || attachments.some((a) => a.type === "note" && a.path === aberta.path)) {
                  return null;
                }
                return (
                  <SheetRow
                    badge
                    chevron
                    icon="file-check"
                    title={tr("This note")}
                    note={aberta.basename}
                    onClick={() => {
                      void anexarNota(aberta.path);
                      closeSheet();
                    }}
                  />
                );
              })()}
              <SheetRow
                badge
                chevron
                icon="file-type-2"
                title="PDF"
                note={
                  modeloLePdf
                    ? tr("From this device")
                    : tr("This model can't read PDFs")
                }
                onClick={() => {
                  closeSheet();
                  pdfRef.current?.click();
                }}
              />
              <SheetRow
                badge
                chevron
                icon="link"
                title="Link"
                note={tr("Fetch a page as context")}
                onClick={() => {
                  closeSheet();
                  void anexarLink();
                }}
              />
              <SheetRow
                badge
                chevron
                icon="sparkles"
                title="Skill"
                note={
                  plugin.skills.length > 0
                    ? tr("{n} in your vault", { n: plugin.skills.length })
                    : tr("None yet")
                }
                onClick={() => setPlusView("skills")}
              />
              <SheetRow
                badge
                chevron
                icon="box"
                title={tr("Artifact")}
                note={tr("Images, audio and video made here")}
                onClick={() => setPlusView("artifacts")}
              />
            </SheetGroup>
          </>
        )}
      </Sheet>

      {}
      <Sheet
        title={
          toolAt !== null && tools
            ? actionTitle(tools[toolAt])
            : (tools?.length ?? 0) === 1
              ? tr("Ran 1 action")
              : tr("Ran {n} actions", { n: tools?.length ?? 0 })
        }
        open={tools !== null}
        onClose={() => {
          setTools(null);
          setToolAt(null);
        }}
        onBack={
          toolAt !== null && (tools?.length ?? 0) > 1
            ? () => setToolAt(null)
            : undefined
        }
      >
        {toolAt !== null && tools ? (
          <ToolDetail
            action={tools[toolAt]}
            app={plugin.app}

            onUndone={(id) =>
              setTools((ts) =>
                ts
                  ? ts.map((x) =>
                      x.kind === "activity" && x.activity.undoId === id
                        ? { ...x, activity: { ...x.activity, undone: true } }
                        : x
                    )
                  : ts
              )
            }
          />
        ) : (
          <SheetGroup>
            {(tools ?? []).map((a, i) => (
              <SheetRow
                key={i}
                dense
                icon={actionIcon(a)}
                iconTone={actionFailed(a) ? "danger" : undefined}
                title={actionTitle(a)}
                note={actionNote(a)}
                tag={
                  actionFailed(a)
                    ? tr("failed")
                    : a.kind === "activity" && a.activity.undone
                      ? tr("undone")
                      : undefined
                }
                onClick={() => setToolAt(i)}
              />
            ))}
          </SheetGroup>
        )}
      </Sheet>

      <Sheet title={tr("Effort")} open={sheet === "effort"} onClose={closeSheet}>
        <SheetGroup>
          {EFFORT_LEVELS.map((l) => (
            <SheetRow
              key={l}
              title={tr(EFFORT_LABELS[l])}
              note={describeEffort(l, plugin.settings.effortConfigs)}
              tag={l === plugin.settings.defaultEffort ? tr("Default") : undefined}
              selected={l === cfg.effort}
              onClick={() => {
                session.setEffort(l);
                closeSheet();
              }}
            />
          ))}
        </SheetGroup>
      </Sheet>
    </div>
  );
}

function ModelRow({
  provider,
  model,
  selected,
  favorito,
  onFavorito,
  onClick,
}: {
  provider: string;
  model: string;
  selected: boolean;

  favorito?: boolean;

  onFavorito?: () => void;
  onClick: () => void;
}) {
  const card = getModelCard(provider, model);
  return (
    <SheetRow
      title={prettyModelName(model)}
      note={card.goodFor ?? card.description}

      icon={modelLogo(model)}
      selected={selected}
      action={
        onFavorito
          ? {
              icon: favorito ? "star" : "star-off",
              label: favorito ? tr("Remove from favorites") : tr("Add to favorites"),
              on: favorito,
              onClick: onFavorito,
            }
          : undefined
      }
      onClick={onClick}
    />
  );
}

function ListaDeModelos({
  provider,
  models,
  catalogo,
  atual,
  query,
  onQuery,
  aba,
  onAba,
  favoritos,
  onFavorito,
  onPick,
  busca = true,
}: {
  provider: string;

  models: string[];

  catalogo: string[];
  atual: string;
  query: string;
  onQuery: (v: string) => void;
  aba: string;
  onAba: (id: string) => void;
  favoritos: string[];
  onFavorito: (m: string) => void;
  onPick: (m: string) => void;

  busca?: boolean;
}) {

  const lista = useMemo(
    () => mergeModelOptions(models, catalogo),
    [models, catalogo]
  );
  const filtrados = useMemo(
    () => filterModels(lista, query, prettyModelName),
    [lista, query]
  );
  const grupos = useMemo(
    () => groupModels(provider, filtrados),
    [provider, filtrados]
  );

  const ativa = grupos.find((g) => g.label === aba) ?? grupos[0];

  const BUSCA_A_PARTIR_DE = 8;
  return (
    <>
      {busca && lista.length >= BUSCA_A_PARTIR_DE && (
        <SheetSearch
          value={query}
          placeholder={tr("Search models")}
          found={filtrados.length}
          onChange={onQuery}
        />
      )}
      {grupos.length > 1 && (
        <SheetTabs
          label={tr("Model category")}
          activeId={ativa?.label ?? ""}
          items={grupos.map((g) => ({
            id: g.label,
            label: tr(g.label),
            count: g.models.length,
          }))}
          onPick={onAba}
        />
      )}
      {ativa && (
        <SheetGroup>
          {ativa.models.map((m) => (
            <ModelRow
              key={m}
              provider={provider}
              model={m}
              selected={m === atual}
              favorito={favoritos.includes(m)}
              onFavorito={() => onFavorito(m)}
              onClick={() => onPick(m)}
            />
          ))}
        </SheetGroup>
      )}
      {filtrados.length === 0 && (
        <SheetGroup>
          <SheetNote>{tr("No model matches that.")}</SheetNote>
        </SheetGroup>
      )}
    </>
  );
}

function Pill({
  label,
  logo,
  active,
  onClick,
}: {
  label: string;
  logo?: string;

  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "corvus-pill is-on" : "corvus-pill"}

      aria-pressed={active === undefined ? undefined : active}
      onClick={onClick}
    >
      {logo && <Icon name={logo} size={16} className="corvus-pill-logo" />}
      <span className="corvus-pill-label">{label}</span>
    </button>
  );
}

function activityText(a: ActivityMeta): string {
  if (a.phase === "pending") return a.pendingText;
  if (a.phase === "done") return a.doneText ?? a.pendingText;
  return a.failedText ?? tr("Failed");
}

export type TurnAction =
  | { kind: "step"; step: AIToolStep }
  | { kind: "activity"; activity: ActivityMeta }

  | { kind: "reasoning"; text: string };

function actionTitle(a: TurnAction): string {
  if (a.kind === "step") return a.step.name;
  if (a.kind === "activity") return activityText(a.activity);
  return tr("Reasoning");
}

function actionNote(a: TurnAction): string | undefined {
  if (a.kind === "step") return toolSummary(a.step);
  if (a.kind === "reasoning") return tr("{n} chars", { n: a.text.length });
  return undefined;
}

function actionFailed(a: TurnAction): boolean {
  if (a.kind === "step") return !a.step.ok;
  if (a.kind === "activity") return a.activity.phase === "failed";
  return false;
}

function actionIcon(a: TurnAction): string {
  if (a.kind === "reasoning") return "brain";
  if (a.kind === "activity") {
    return a.activity.phase === "failed"
      ? a.activity.iconFailed ?? "circle-alert"
      : a.activity.iconPending;
  }
  if (!a.step.ok) return "circle-alert";
  return agentActivitySpec(a.step.name, a.step.arguments ?? {}).iconPending;
}

function toolSummary(step: AIToolStep): string {
  const args = Object.entries(step.arguments ?? {});
  if (args.length === 0) return step.ok ? tr("done") : tr("failed");
  const [chave, valor] = args[0];
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
  return `${chave}: ${texto}`.slice(0, 80);
}

function UndoChip({
  plugin,
  actions,
}: {
  plugin: CorvusPlugin;
  actions: TurnAction[];
}) {
  const [rodando, setRodando] = useState(false);
  const ids = desfaziveis(
    actions.map((a) => (a.kind === "activity" ? a.activity : undefined))
  );
  if (ids.length === 0) return null;
  return (
    <button
      type="button"
      className="corvus-tools-chip"
      disabled={rodando}
      aria-label={
        ids.length === 1
          ? tr("Undo the agent's change")
          : tr("Undo the agent's {n} changes", { n: ids.length })
      }
      onClick={() => {
        setRodando(true);
        void desfazerRodada(plugin.app, ids).finally(() => setRodando(false));
      }}
    >
      <Icon name="undo-2" size={15} />
      <span>{tr("Undo")}</span>
    </button>
  );
}

function ToolDetail({
  action,
  app,
  onUndone,
}: {
  action: TurnAction;
  app: App;
  onUndone: (id: string) => void;
}) {
  const ok = !actionFailed(action);
  const pending =
    action.kind === "activity" && action.activity.phase === "pending";
  const [rodando, setRodando] = useState(false);
  const desfazivel =
    action.kind === "activity" ? idDesfazivel(action.activity) : null;
  const desfeita = action.kind === "activity" && action.activity.undone;
  return (
    <div className="corvus-tool-detail">
      {action.kind !== "reasoning" && (
        <p className={ok ? "corvus-tool-state is-ok" : "corvus-tool-state"}>
          <Icon
            name={pending ? "loader-circle" : ok ? "circle-check" : "circle-alert"}
            size={15}
          />
          {pending ? tr("Running") : ok ? tr("Completed") : tr("Failed")}
        </p>
      )}
      {desfeita && (
        <p className="corvus-tool-state is-undone">
          <Icon name="undo-2" size={15} />
          {tr("Undone")}
        </p>
      )}
      {desfazivel && (
        <button
          type="button"
          className="corvus-tool-undo"
          disabled={rodando}
          onClick={() => {
            setRodando(true);
            void desfazerUma(app, desfazivel)
              .then((feito) => {
                if (feito) onUndone(desfazivel);
              })
              .finally(() => setRodando(false));
          }}
        >
          <Icon name="undo-2" size={16} />
          <span>{tr("Undo this change")}</span>
        </button>
      )}
      {action.kind === "step" ? (
        <>
          <p className="corvus-tool-label">{tr("Arguments")}</p>
          <pre className="corvus-tool-block">
            {JSON.stringify(action.step.arguments ?? {}, null, 2)}
          </pre>
          <p className="corvus-tool-label">{tr("Result")}</p>
          <pre className="corvus-tool-block">
            {action.step.result || tr("(empty)")}
          </pre>
        </>
      ) : action.kind === "activity" ? (
        action.activity.toolName ? (
          <>
            <p className="corvus-tool-label">{tr("Tool call")}</p>
            <pre className="corvus-tool-block">
              {action.activity.toolName}(
                {JSON.stringify(action.activity.toolArguments ?? {}, null, 2)})
            </pre>
            <p className="corvus-tool-label">
              {pending ? tr("Status") : tr("Result")}
            </p>
            <pre className="corvus-tool-block">
              {pending
                ? activityText(action.activity)
                : action.activity.detail || activityText(action.activity)}
            </pre>
          </>
        ) : (
          <>
            <p className="corvus-tool-label">{tr("What happened")}</p>
            <pre className="corvus-tool-block">
              {action.activity.detail || activityText(action.activity)}
            </pre>
          </>
        )
      ) : (
        <pre className="corvus-tool-block is-prose">{action.text}</pre>
      )}
    </div>
  );
}

function ReadAloudButton({
  plugin,
  text,
}: {
  plugin: CorvusPlugin;
  text: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  return (
    <button
      type="button"
      className={speaking ? "corvus-msg-listen is-on" : "corvus-msg-listen"}
      aria-label={speaking ? tr("Stop") : tr("Read aloud")}
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        setSpeaking(true);
        void speak(plugin, text).finally(() => setSpeaking(false));
      }}
    >
      <Icon name={speaking ? "square" : "volume-2"} size={15} />
      <span>{speaking ? tr("Stop") : tr("Listen")}</span>
    </button>
  );
}

const MessageRow = memo(function MessageRow({
  msg,
  plugin,
  streaming,
  glow,
  actions,
  onOpenTools,
}: {
  msg: ChatMessage;
  plugin: CorvusPlugin;
  streaming: boolean;

  glow?: boolean;

  actions?: TurnAction[];
  onOpenTools?: (actions: TurnAction[]) => void;

  idioma?: string;
}) {
  switch (msg.type) {
    case "user":
      return (
        <div className="corvus-msg corvus-msg-user" data-msg={msg.id}>
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="corvus-msg-attachments">
              {msg.attachments.map((a, i) => {
                const thumb = attachmentThumb(a);
                return thumb.kind === "image" ? (
                  <button
                    key={i}
                    type="button"
                    className="corvus-msg-attachment-img-btn"
                    aria-label={attachmentLabel(a)}
                    onClick={() =>
                      new ImageModal(plugin.app, thumb.url, attachmentLabel(a)).open()
                    }
                  >
                    <img
                      className="corvus-msg-attachment-img"
                      src={thumb.url}
                      alt=""
                    />
                  </button>
                ) : (
                  <span className="corvus-pill-chip" key={i}>
                    <span className="corvus-pill-chip-emoji" aria-hidden="true">
                      {thumb.char}
                    </span>
                    <span className="corvus-pill-chip-label">
                      {attachmentLabel(a)}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
          <div className="corvus-msg-text">{msg.content}</div>
        </div>
      );
    case "ai-response":
      return (
        <div
          data-msg={msg.id}
          className={
            "corvus-msg corvus-msg-ai" +
            (msg.isError ? " corvus-msg-error" : "") +
            (glow ? " is-done" : "")
          }
        >
          {msg.reasoning && (
            <button
              type="button"
              className="corvus-tools-chip"
              onClick={() =>
                onOpenTools?.([{ kind: "reasoning", text: msg.reasoning ?? "" }])
              }
            >
              <span>{tr("Reasoning")}</span>
              <Icon name="chevron-right" size={15} />
            </button>
          )}
          {msg.isError ? (
            <div className="corvus-msg-text">{msg.content}</div>
          ) : (
            <Markdown
              app={plugin.app}
              text={msg.content}
              streaming={streaming}
            />
          )}
          {plugin.settings.ttsEnabled && !msg.isError && msg.content.trim() && (
            <ReadAloudButton plugin={plugin} text={msg.content} />
          )}
          {msg.truncated && <small className="corvus-msg-note">{tr("truncated")}</small>}
          {actions && actions.length > 0 && (
            <div className="corvus-tools-row">
              {}
              <button
                type="button"
                className="corvus-tools-chip"
                onClick={() => onOpenTools?.(actions)}
              >
                <span>
                  {actions.length === 1
                    ? tr("Ran 1 action")
                    : tr("Ran {n} actions", { n: actions.length })}
                </span>
                <Icon name="chevron-right" size={15} />
              </button>
              {}
              <UndoChip plugin={plugin} actions={actions} />
            </div>
          )}
        </div>
      );
    case "ai-comment":
      return (
        <div className="corvus-msg corvus-msg-comment" data-msg={msg.id}>
          <Icon
            name={
              msg.activity?.phase === "failed"
                ? "alert-triangle"
                : msg.activity?.phase === "done"
                  ? "check"
                  : "loader"
            }
            size={13}
          />
          <span>
            {msg.activity ? activityText(msg.activity) : msg.content}
            {msg.activity && msg.content ? ` — ${msg.content}` : ""}
          </span>
          {msg.activity?.detail && (

            <button
              type="button"
              className="corvus-tools-chip is-inline"
              onClick={() =>
                msg.activity &&
                onOpenTools?.([{ kind: "activity", activity: msg.activity }])
              }
            >
              <span>{tr("details")}</span>
              <Icon name="chevron-right" size={14} />
            </button>
          )}
        </div>
      );
    case "ai-options":
      return (
        <div className="corvus-msg corvus-msg-options" data-msg={msg.id}>
          <div>{msg.prompt}</div>
          <div className="corvus-suggestions">
            {msg.options.map((o, i) => (
              <button
                key={i}
                type="button"
                className={
                  msg.selectedIndex === i ? "corvus-chip is-active" : "corvus-chip"
                }
                disabled={msg.selectedIndex !== undefined}
                onClick={() => useChatStore.getState().selectOption(msg.id, i)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      );
    default:
      return null;
  }
});

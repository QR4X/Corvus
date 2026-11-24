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
} from "obsidian";
import type CorvusPlugin from "../main";
import {
  NEW_CHAT_DRAFT,
  useChatStore,
  type ChatMessage,
} from "../store/chat";
import { CHAT_MODES, type ChatSession } from "../core/session";
import {
  PROVIDERS,
  providerCredential,
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
import { htmlTitle, htmlToText } from "../core/html";
import { isImageExt } from "../core/imageStore";
import { GENERATION_FOLDER } from "../core/vaultPaths";
import {
  linkNote,
  normalizeUrl,
  rankArtifacts,
  vaultArtifacts,
  attachmentLabel,
  attachmentThumb,
  artifactIcon,
  type ArtifactLike,
} from "./attachSources";
import { getModelCapabilities } from "../providers/modelCapabilities";
import { getTranscriptionCredential } from "../providers/transcribe";
import { ConfirmModal, PromptModal, openPluginSettings } from "./modals";
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
} from "./Sheet";
import { modelLogo } from "../providers/modelLogo";
import {
  rankNotes,
  readNote,
  activeNote,
  vaultNotes,
  wikilinkQuery,
  type NoteLike,
} from "./notePicker";
import { StarterScreen } from "./StarterScreen";
import { ThinkingTrace } from "./ThinkingTrace";
import { buildTurnTraces, type TraceGroup, type TurnTraces } from "../core/trace";
import type { ComposerInject } from "./App";
import { MODULES, moduleFabLabel, modulePlaceholder } from "./modules";
import { filterModels, groupModels, mergeModelOptions } from "./modelGroups";

import { FAVORITE_LIMIT } from "./SettingsTab";
import { asText } from "../core/text";
import { mark, tr } from "../i18n/tr";

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
  onOpenMenu,
  onBackHome,
  onUseSkill,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  inject: ComposerInject | null;
  onOpenMenu?: () => void;
  onBackHome: () => void;
  onUseSkill: (skill: Skill) => void;
}) {
  const messages = useChatStore((s) => s.messages);

  const anyReplying = useChatStore((s) => s.isLoading);
  const turnChatId = useChatStore((s) => s.turnChatId);
  const loadingChat = useChatStore((s) => s.loadingChat);
  const streamingId = useChatStore((s) => s.streamingMessageId);
  const currentChatId = useChatStore((s) => s.currentChatId);

  const isLoading = anyReplying && turnChatId === currentChatId;

  const otherReplying = anyReplying && !isLoading;

  const currentChatTitle = useChatStore((s) => s.currentChatTitle);

  const attachments = useChatStore((s) => s.attachments);
  const addAttachment = useChatStore((s) => s.addAttachment);
  const removeAttachment = useChatStore((s) => s.removeAttachment);

  const queued = useChatStore((s) => s.queued);
  const pushQueued = useChatStore((s) => s.pushQueued);
  const removeQueued = useChatStore((s) => s.removeQueued);

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
  const pdfRef = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLElement>(null);

  const publishRef = useRef<(() => void) | null>(null);

  const focusBeforeSheet = useRef(false);

  const frameRef = useRef(0);
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
    else if (!frameRef.current) {
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = 0;
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
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    },
    []
  );

  const tracesRef = useRef<TurnTraces | undefined>(undefined);
  const traces = useMemo(() => {
    const next = buildTurnTraces(messages, tracesRef.current);
    tracesRef.current = next;
    return next;
  }, [messages]);
  const { hidden: hiddenIds, byResponse: tracesByResponse, live: liveGroup } = traces;

  const last = messages[messages.length - 1];
  const alreadyWriting =
    last?.type === "ai-response" &&
    last.id === streamingId &&
    last.content.length > 0;
  const thinkingNow = (isLoading || liveGroup !== null) && !alreadyWriting;

  const [following, setFollowing] = useState(true);

  const followingRef = useRef(true);
  followingRef.current = following;

  const [jumpId, setJumpId] = useState<string | null>(null);

  const prevHeightRef = useRef(0);

  const gestureRef = useRef(false);

  const stickToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const resumeRef = useRef<
    | { scroll: number; since: number }
    | { messageId: string; since: number }
    | null
  >(null);

  const RESUME_MS = 1500;

  const applyResume = () => {
    const target = resumeRef.current;
    const el = scrollRef.current;
    if (!target || !el) return false;
    const gaveUp = Date.now() - target.since > RESUME_MS;
    if ("messageId" in target) {
      const msg = el.querySelector<HTMLElement>(`[data-msg="${target.messageId}"]`);
      if (!msg) {
        if (!gaveUp) return false;
        resumeRef.current = null;
        return false;
      }

      const dest = Math.max(0, msg.offsetTop - 12);
      el.scrollTop = dest;

      if (!gaveUp && Math.abs(el.scrollTop - dest) > 2) return false;
    } else {
      const dest = target.scroll;
      el.scrollTop = dest;
      if (!gaveUp && Math.abs(el.scrollTop - dest) > 2) return false;
    }
    resumeRef.current = null;
    prevHeightRef.current = el.scrollHeight;
    followingRef.current = false;
    setFollowing(false);
    return true;
  };

  const reevaluate = () => {
    const el = scrollRef.current;
    if (!el) return;

    if (resumeRef.current) {
      applyResume();
      prevHeightRef.current = el.scrollHeight;
      return;
    }
    const { pin, following: atBottom } = decideScroll({
      gesture: gestureRef.current,
      previousHeight: prevHeightRef.current,
      currentHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
    });
    if (pin) el.scrollTop = el.scrollHeight;
    prevHeightRef.current = el.scrollHeight;
    if (atBottom !== followingRef.current) {
      followingRef.current = atBottom;
      setFollowing(atBottom);
    }
    if (atBottom) setJumpId(null);
  };

  const scrollToBottom = () => {

    resumeRef.current = null;
    gestureRef.current = false;
    followingRef.current = true;
    setFollowing(true);
    setJumpId(null);
    stickToBottom();
    const el = scrollRef.current;
    if (el) prevHeightRef.current = el.scrollHeight;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    prevHeightRef.current = el.scrollHeight;

    const obs = new MutationObserver(reevaluate);
    obs.observe(el, { childList: true, subtree: true, characterData: true });

    let settleTimer = 0;
    const startGesture = () => {
      gestureRef.current = true;
      window.clearTimeout(settleTimer);
      settleTimer = 0;
    };
    const endGesture = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        settleTimer = 0;
        gestureRef.current = false;
        reevaluate();
      }, 320);
    };
    const onScroll = () => {

      useChatStore.setState({
        viewScrollTop: el.scrollTop,
        viewChatId: useChatStore.getState().currentChatId,
      });

      if (settleTimer) endGesture();
      reevaluate();
    };

    const captureOpts = { passive: true, capture: true } as const;
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", startGesture, captureOpts);
    el.addEventListener("touchend", endGesture, captureOpts);
    el.addEventListener("touchcancel", endGesture, captureOpts);
    el.addEventListener("wheel", startGesture, captureOpts);
    el.addEventListener("wheel", endGesture, captureOpts);
    const mouseDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") startGesture();
    };
    const mouseUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") endGesture();
    };
    el.addEventListener("pointerdown", mouseDown, captureOpts);
    window.addEventListener("pointerup", mouseUp);

    return () => {
      obs.disconnect();
      window.clearTimeout(settleTimer);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", startGesture, captureOpts);
      el.removeEventListener("touchend", endGesture, captureOpts);
      el.removeEventListener("touchcancel", endGesture, captureOpts);
      el.removeEventListener("wheel", startGesture, captureOpts);
      el.removeEventListener("wheel", endGesture, captureOpts);
      el.removeEventListener("pointerdown", mouseDown, captureOpts);
      window.removeEventListener("pointerup", mouseUp);
    };
  }, []);

  useEffect(reevaluate, [messages, streamingId]);

  useEffect(() => {
    const el = composerRef.current;
    const root = el?.closest(".corvus-root") as HTMLElement | null;
    if (!el || !root) return;
    const publish = () => {

      root.style.setProperty(
        "--corvus-composer-h",
        `${Math.max(0, Math.round(el.getBoundingClientRect().height))}px`
      );

      reevaluate();
    };
    publishRef.current = publish;
    publish();
    const obs = new ResizeObserver(publish);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useLayoutEffect(() => {
    publishRef.current?.();
  });

  useEffect(() => {

    const { resumeScroll, resumeMessageId } = useChatStore.getState();
    if (resumeScroll !== null || resumeMessageId !== null) {
      useChatStore.getState().setResume({});
      gestureRef.current = false;
      setJumpId(null);
      followingRef.current = false;
      setFollowing(false);
      resumeRef.current =
        resumeMessageId !== null
          ? { messageId: resumeMessageId, since: Date.now() }
          : { scroll: resumeScroll as number, since: Date.now() };

      window.requestAnimationFrame(() => applyResume());
      return;
    }

    const { viewChatId, viewScrollTop } = useChatStore.getState();
    if (currentChatId && viewChatId === currentChatId && viewScrollTop > 0) {
      gestureRef.current = false;
      setJumpId(null);
      followingRef.current = false;
      setFollowing(false);
      resumeRef.current = { scroll: viewScrollTop, since: Date.now() };
      window.requestAnimationFrame(() => applyResume());
      return;
    }
    resumeRef.current = null;
    scrollToBottom();
  }, [currentChatId]);

  const replyingRef = useRef(false);
  useEffect(() => {
    const replyingNow = isLoading || streamingId !== null;
    const finished = replyingRef.current && !replyingNow;
    replyingRef.current = replyingNow;
    if (!finished) return;
    if (followingRef.current) return;
    const last = [...messages]
      .reverse()
      .find((m) => m.type === "ai-response");
    if (!last) return;
    setJumpId(last.id);

    commit();
  }, [isLoading, streamingId, messages]);

  const showJump = shouldShowJump(
    following,
    isLoading || streamingId !== null,
    jumpId !== null
  );

  const onComposerFocus = () => {
    if (!followingRef.current) return;
    stickToBottom();
    window.setTimeout(stickToBottom, 350);
  };

  const checkMention = (el: HTMLTextAreaElement) => {
    const found = wikilinkQuery(el.value, el.selectionStart ?? el.value.length);
    setMention(found);
  };

  const pickMention = (n: NoteLike) => {
    const el = textareaRef.current;
    if (!el || !mention) return;
    const cursor = el.selectionStart ?? draft.length;
    const link = `[[${n.path.replace(/\.md$/, "")}]]`;
    const before = draft.slice(0, mention.start);
    const updated = before + link + draft.slice(cursor);
    setDraft(updated);
    setMention(null);
    void attachNote(n.path);

    const end = before.length + link.length;
    window.setTimeout(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(end, end);
    }, 0);
  };

  const onBlockedTap = async (
    id: string,
    reason: string,
    insisted: boolean
  ) => {
    const name = PROVIDERS.find((p) => p.id === id)?.name ?? id;
    if (!insisted) {
      new Notice(`${name} — ${tr(reason)}`);
      return;
    }
    const proceed = await new ConfirmModal(plugin.app, {
      title: tr("{name} is not set up", { name }),
      body: `${tr(reason)}

${tr("Open Settings › Providers to add it, then run the connection test.")}`,
      confirmLabel: tr("Open settings"),
    }).openAndWait();
    if (proceed) {
      closeSheet();
      openPluginSettings(plugin);
    }
  };

  const attachPdf = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = asText(reader.result);
      if (!dataUrl.startsWith("data:")) return;
      addAttachment({ type: "pdf", name: file.name, dataUrl });
    };
    reader.onerror = () => new Notice(tr("Could not read that file."));
    reader.readAsDataURL(file);
  };

  const attachLink = async () => {
    const typed = await new PromptModal(plugin.app, {
      title: tr("Attach link"),
      label: tr("Address"),
      placeholder: "https://…",
      submitLabel: tr("Fetch"),
    }).openAndWait();
    const url = normalizeUrl(typed ?? "");
    if (!url) {
      if (typed) new Notice(tr("That doesn't look like an address."));
      return;
    }
    const notice = new Notice(tr("Fetching {url}…", { url }), 0);
    try {

      const res = await requestUrl({ url });
      const text = htmlToText(res.text ?? "");
      if (!text) {
        new Notice(tr("Nothing readable at that address."));
        return;
      }
      addAttachment(linkNote(url, htmlTitle(res.text ?? ""), text));
    } catch {
      new Notice(tr("Could not reach that address."));
    } finally {
      notice.hide();
    }
  };

  const attachArtifact = async (a: ArtifactLike) => {
    try {
      if (isImageExt(a.extension) && modelSeesImages) {
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

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboard = e.clipboardData;
    if (!clipboard) return;

    const pastedText = clipboard.getData("text");

    const images = Array.from(clipboard.files ?? []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (images.length > 0) {
      e.preventDefault();
      if (!modelSeesImages) {
        new Notice(tr("This model can't read images."));
        return;
      }
      for (const img of images) attachImage(img);
      return;
    }

    if (pasteIsBig(pastedText)) {
      e.preventDefault();
      addAttachment(pastedNote(pastedText));
    }
  };

  const attachNote = async (path: string) => {
    const note = await readNote(plugin.app, path);
    if (!note) {
      new Notice(tr("Note not found: {path}", { path }));
      return;
    }
    addAttachment({ type: "note", path: note.path, content: note.content });
  };

  const attachImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = asText(reader.result);
      if (!dataUrl.startsWith("data:")) return;
      addAttachment({
        type: "image",
        dataUrl,
        mimeType: file.type || undefined,
        name: file.name,
      });
    };
    reader.onerror = () => new Notice(tr("Could not read that image."));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;

    scrollToBottom();

    if (otherReplying) {

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

    const sentKey = draftKey;

    writeDraft(sentKey, "");
    const sent = await session.send(text);

    if (!sent && !(useChatStore.getState().drafts[sentKey] ?? "").trim()) {
      writeDraft(sentKey, text);
    }
  };

  const openSheet = (which: "model" | "effort" | "plus") => {
    const field = textareaRef.current;
    focusBeforeSheet.current =
      field != null && field.ownerDocument.activeElement === field;
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

    if (focusBeforeSheet.current) {
      focusBeforeSheet.current = false;
      window.setTimeout(
        () => textareaRef.current?.focus({ preventScroll: true }),
        0
      );
    }
  };

  const noteHits = useMemo(() => {
    if (sheet !== "plus" || plusView !== "notes") return [];
    return rankNotes(vaultNotes(plugin.app), noteQuery);
  }, [sheet, plusView, noteQuery, plugin.app]);

  const mentionHits = useMemo(
    () => (mention ? rankNotes(vaultNotes(plugin.app), mention.query, 6) : []),
    [mention, plugin.app]
  );

  const caps = getModelCapabilities(cfg.provider, cfg.model);
  const modelSeesImages =
    caps.vision ||
    getModelCard(cfg.provider, cfg.model).category === "chat-vision";
  const modelReadsPdf = caps.pdf === true;

  const artifacts = useMemo(() => {
    if (sheet !== "plus" || plusView !== "artifacts") return [];
    return rankArtifacts(vaultArtifacts(plugin.app));
  }, [sheet, plusView, plugin.app]);

  const favorites = (
    plugin.settings.favoriteModels?.[pickProvider] ?? []
  ).slice(0, 5);

  const providerActive = session.modelOptions(pickProvider);
  const providerCatalog = plugin.settings.discoveredModels?.[pickProvider] ?? [];
  const allModels = mergeModelOptions(providerActive, providerCatalog);
  const rest = allModels.filter((m) => !favorites.includes(m));

  const voice = useVoice({
    apiKey: () => {
      const cred = getTranscriptionCredential(plugin.settings);
      return cred?.apiKey ?? "";
    },
    model: () => plugin.settings.voiceModel,
    language: () => plugin.settings.voiceLanguage,
    onTranscript: setLiveText,

    onFinal: (text) => {
      setLiveText("");
      if (!text) return;
      setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text));
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

  const triedCatalogs = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (sheet !== "model") return;
    if (plugin.settings.discoveredModels?.[pickProvider]) return;
    if (!providerCredential(plugin.settings, pickProvider)) return;
    if (triedCatalogs.current.has(pickProvider)) return;
    triedCatalogs.current.add(pickProvider);

    void plugin.models.scanModels(pickProvider).catch(() => {});
  }, [sheet, pickProvider, plugin]);

  const toggleFavorite = async (model: string) => {
    const existing = plugin.settings.favoriteModels?.[pickProvider] ?? [];
    const isFavorite = existing.includes(model);
    if (!isFavorite && existing.length >= FAVORITE_LIMIT) {
      new Notice(
        tr("{n} favorites per provider is the limit — unstar one first.", {
          n: FAVORITE_LIMIT,
        })
      );
      return;
    }
    plugin.settings.favoriteModels = {
      ...(plugin.settings.favoriteModels ?? {}),
      [pickProvider]: isFavorite
        ? existing.filter((x) => x !== model)
        : [...existing, model],
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
        <button
          type="button"
          className="corvus-icon-btn"
          aria-label={tr("Back to dashboard")}
          onClick={onBackHome}
        >
          <Icon name="arrow-left" />
        </button>
        <div className="corvus-topbar-title">
          <span className="corvus-topbar-name">
            {currentChatId
              ? currentChatTitle || tr("Untitled")
              : tr(moduleFabLabel(cfg.mode))}
          </span>
          <span className="corvus-topbar-meta">
            <span className={`corvus-mode-tag is-${cfg.mode}`}>
              <Icon name={MODULES[cfg.mode].icon} size={11} />
              <span>{tr(MODULES[cfg.mode].short)}</span>
            </span>
            {cfg.model && <span className="corvus-topbar-model"> · {cfg.model}</span>}
          </span>
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
              glow={m.id === jumpId}
              trace={tracesByResponse.get(m.id)}
            />
          ))
        )}

        {}
        {thinkingNow && (
          <ThinkingTrace
            group={liveGroup}
            live={isLoading}
            stopped={!isLoading}
            app={plugin.app}
          />
        )}
      </div>

      {}
      <section className="corvus-composer" ref={composerRef}>
          {}
          {showJump && (
            <button
              type="button"
              className={jumpId ? "corvus-jump is-done" : "corvus-jump"}
              onClick={scrollToBottom}
            >
              <Icon name="arrow-down" size={15} />
              {jumpId ? tr("Answer ready") : tr("Jump to latest")}
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
                    pickMention(n);
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
              <div className="corvus-composer-mode">
                <div
                  className="corvus-composer-mode-pills"
                  role="radiogroup"
                  aria-label={tr("Chat mode")}
                >
                  {CHAT_MODES.map((m) => {
                    const active = cfg.mode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={
                          active
                            ? "corvus-composer-mode-btn is-active"
                            : "corvus-composer-mode-btn"
                        }
                        onClick={() => session.setMode(m)}
                        title={tr(MODULES[m].tagline)}
                      >
                        <Icon name={MODULES[m].icon} size={13} />
                        <span>{tr(MODULES[m].short)}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="corvus-composer-mode-tagline">
                  {cfg.mode === "vault-qa"
                    ? tr("Reads vault")
                    : cfg.mode === "agent"
                    ? tr("Edits vault")
                    : tr("Direct chat")}
                </span>
              </div>
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                placeholder={tr(modulePlaceholder(cfg.mode))}
                onFocus={onComposerFocus}
                onChange={(e) => {
                  setDraft(e.currentTarget.value);
                  checkMention(e.currentTarget);
                }}
                onSelect={(e) => checkMention(e.currentTarget)}
                onPaste={onPaste}
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
                    pickMention(mentionHits[0]);
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
                    if (f) attachImage(f);
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
                    if (f) attachPdf(f);
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
                        aria-label={
                          cfg.mode === "agent"
                            ? tr("Queue message")
                            : tr("Send when this finishes")
                        }
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
            onBlocked={(id, reason, insisted) =>
              void onBlockedTap(id, reason, insisted)
            }
            items={PROVIDERS.map((p) => ({
              id: p.id,
              icon: p.icon,
              label: p.name,
              health: providerHealth(plugin.settings, p.id),
              blocked: providerBlockedReason(plugin.settings, p.id),
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
                ? filterModels(allModels, modelQuery, prettyModelName).length
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
          <ModelList
            provider={pickProvider}

            models={providerActive}
            catalog={providerCatalog}
            current={pickProvider === cfg.provider ? cfg.model : ""}
            query={modelQuery}
            onQuery={setModelQuery}
            tab={modelTab}
            onTab={setModelTab}
            favorites={favorites}
            onToggleFavorite={(m) => void toggleFavorite(m)}
            onPick={chooseModel}

            searchable={modelView !== "root"}
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
                    favorite
                    onToggleFavorite={() => void toggleFavorite(m)}
                    onClick={() => chooseModel(m)}
                  />
                ))}
              </SheetGroup>
            ) : (
              <SheetGroup>
                <SheetNote>
                  {rest.length > 0
                    ? tr(
                        "No favorites yet. Star up to {n} models in Settings, or open the full list.",
                        { n: FAVORITE_LIMIT }
                      )
                    : tr(
                        "Nothing marked yet. Pick what shows here in Settings → Providers."
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
                  note={`${allModels.length}`}
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
        fit
      >
        {plusView === "notes" ? (
          <>
            <SheetSearch
              value={noteQuery}
              placeholder={tr("Search notes")}
              found={noteHits.length}
              autoFocus
              onChange={setNoteQuery}
            />
            <SheetGroup>
              {noteHits.map((n) => (
                <SheetRow
                  key={n.path}
                  dense
                  icon="file-text"
                  title={n.basename}
                  note={n.path}
                  onClick={() => {
                    void attachNote(n.path);
                    closeSheet();
                  }}
                />
              ))}
              {noteHits.length === 0 && (
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
                  "No skills yet. They live as notes in your vault and appear here once created."
                )}
              </SheetNote>
            )}
          </SheetGroup>
        ) : plusView === "artifacts" ? (
          <SheetGroup>
            {artifacts.map((a) => (
              <SheetRow
                key={a.path}
                dense
                icon={artifactIcon(a.extension)}
                title={a.basename}
                note={a.path}
                onClick={() => {
                  void attachArtifact(a);
                  closeSheet();
                }}
              />
            ))}
            {artifacts.length === 0 && (
              <SheetNote>
                {tr(
                  "Nothing yet. Images, audio and video you make land in {folder} and appear here.",
                  { folder: GENERATION_FOLDER }
                )}
              </SheetNote>
            )}
          </SheetGroup>
        ) : (
          <SheetGroup>
            {(() => {
              const openNote = sheet === "plus" ? activeNote(plugin.app) : null;
              if (
                !openNote ||
                attachments.some(
                  (a) => a.type === "note" && a.path === openNote.path
                )
              ) {
                return null;
              }
              return (
                <SheetRow
                  badge
                  chevron
                  icon="file-check"
                  title={tr("Current note")}
                  note={openNote.basename}
                  onClick={() => {
                    void attachNote(openNote.path);
                    closeSheet();
                  }}
                />
              );
            })()}

            <SheetRow
              badge
              chevron
              icon="file-text"
              title={tr("Vault notes")}
              note={tr("Search and attach notes")}
              onClick={() => {
                setNoteQuery("");
                setPlusView("notes");
              }}
            />

            <SheetRow
              badge
              chevron
              icon="image"
              title={tr("Image")}
              note={
                modelSeesImages
                  ? tr("Photo library or camera")
                  : tr("This model can't read images")
              }
              disabled={!modelSeesImages}
              onClick={() => {
                closeSheet();
                imageRef.current?.click();
              }}
            />

            <SheetRow
              badge
              chevron
              icon="file-type-2"
              title={tr("PDF document")}
              note={
                modelReadsPdf
                  ? tr("From this device")
                  : tr("This model can't read PDFs")
              }
              disabled={!modelReadsPdf}
              onClick={() => {
                closeSheet();
                pdfRef.current?.click();
              }}
            />

            <SheetRow
              badge
              chevron
              icon="link"
              title={tr("Web link")}
              note={tr("Fetch a web page as context")}
              onClick={() => {
                closeSheet();
                void attachLink();
              }}
            />

            <SheetRow
              badge
              chevron
              icon="sparkles"
              title={tr("Skill")}
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
              title={tr("Artifacts")}
              note={tr("Images, audio and video made here")}
              onClick={() => setPlusView("artifacts")}
            />
          </SheetGroup>
        )}
      </Sheet>

      {}
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
  favorite,
  onToggleFavorite,
  onClick,
}: {
  provider: string;
  model: string;
  selected: boolean;

  favorite?: boolean;

  onToggleFavorite?: () => void;
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
        onToggleFavorite
          ? {
              icon: favorite ? "star" : "star-off",
              label: favorite ? tr("Remove from favorites") : tr("Add to favorites"),
              on: favorite,
              onClick: onToggleFavorite,
            }
          : undefined
      }
      onClick={onClick}
    />
  );
}

function ModelList({
  provider,
  models,
  catalog,
  current,
  query,
  onQuery,
  tab,
  onTab,
  favorites,
  onToggleFavorite,
  onPick,
  searchable: searchable = true,
}: {
  provider: string;

  models: string[];

  catalog: string[];
  current: string;
  query: string;
  onQuery: (v: string) => void;
  tab: string;
  onTab: (id: string) => void;
  favorites: string[];
  onToggleFavorite: (m: string) => void;
  onPick: (m: string) => void;

  searchable?: boolean;
}) {

  const all = useMemo(
    () => mergeModelOptions(models, catalog),
    [models, catalog]
  );
  const filtered = useMemo(
    () => filterModels(all, query, prettyModelName),
    [all, query]
  );
  const groups = useMemo(
    () => groupModels(provider, filtered),
    [provider, filtered]
  );

  const activeGroup = groups.find((g) => g.label === tab) ?? groups[0];

  const SEARCH_MIN = 8;
  return (
    <>
      {searchable && all.length >= SEARCH_MIN && (
        <SheetSearch
          value={query}
          placeholder={tr("Search models")}
          found={filtered.length}
          onChange={onQuery}
        />
      )}
      {groups.length > 1 && (
        <SheetTabs
          label={tr("Model category")}
          activeId={activeGroup?.label ?? ""}
          items={groups.map((g) => ({
            id: g.label,
            label: tr(g.label),
            count: g.models.length,
          }))}
          onPick={onTab}
        />
      )}
      {activeGroup && (
        <SheetGroup>
          {activeGroup.models.map((m) => (
            <ModelRow
              key={m}
              provider={provider}
              model={m}
              selected={m === current}
              favorite={favorites.includes(m)}
              onToggleFavorite={() => onToggleFavorite(m)}
              onClick={() => onPick(m)}
            />
          ))}
        </SheetGroup>
      )}
      {filtered.length === 0 && (
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
  onClick,
}: {
  label: string;
  logo?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="corvus-pill"
      onClick={onClick}
    >
      {logo && <Icon name={logo} size={16} className="corvus-pill-logo" />}
      <span className="corvus-pill-label">{label}</span>
    </button>
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
  trace,
}: {
  msg: ChatMessage;
  plugin: CorvusPlugin;
  streaming: boolean;

  glow?: boolean;

  trace?: TraceGroup;
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
          {trace && <ThinkingTrace group={trace} live={false} app={plugin.app} />}
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
        </div>
      );
    case "ai-comment":
      return (
        <div className="corvus-msg corvus-msg-comment" data-msg={msg.id}>
          <span>{msg.content}</span>
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

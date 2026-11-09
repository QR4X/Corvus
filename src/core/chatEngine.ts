import { useChatStore } from "../store/chat";
import type { getProvider } from "../providers";
import { semCredencial, describeProviderError } from "./helpers";
import { resolveEffortConfig, effortToMaxTokensSmart, isEffortLevel } from "./effort";
import { resolveMaxTokens } from "../providers/paramPolicy";
import { responseIssue } from "../providers/base";
import { getContextWindow } from "./contextWindows";
import {
  blocoDeNotasAnexadas,
  buildChatSystemPrompt,
  storeMessagesToProvider,
} from "../agent/conversation";
import type { getTranslations } from "../i18n";
import type {
  MessageAttachment,
  NoteAttachment,
  ProviderMessage,
} from "../providers/base";
import type CorvusPlugin from "../main";
import { buscarContextoDoVault } from "./vaultLookup";
import { loadAgentMd } from "./agentMd";

export interface AbortRef {
  current: AbortController | null;
}

export interface EngineCtx {
  plugin: CorvusPlugin;
  t: ReturnType<typeof getTranslations>;
  abortRef: AbortRef;
  activeProviderId: string;
  activeProvider: ReturnType<typeof getProvider>;
  activeModel: string;

  activeMode: string;

  useVault: boolean;
  apiKeyFor: (providerId: string) => string;
  effort: string;

  resolveStyleInstruction: () => string;
}

export async function streamReply(
  ctx: EngineCtx,
  userText: string,
  userAttachments?: MessageAttachment[]
): Promise<void> {
  const {
    plugin,
    t,
    abortRef,
    activeProviderId,
    activeProvider,
    activeModel,
    apiKeyFor,
    effort,
    useVault,
    resolveStyleInstruction,
  } = ctx;
  const {
    addMessage,
    appendToMessage,
    updateActivity,
    setLoading,
    setStreamingMessageId,
    addUsage,
    startStreamTimer,
    tickStreamTokens,
    endStreamTimer,
  } = useChatStore.getState();

  const falta = semCredencial(
    activeProviderId,
    apiKeyFor(activeProviderId),
    t,
    activeProvider.name
  );
  if (falta) {
    addMessage({
      type: "ai-response",
      content: `${t.ai.errorPrefix} ${falta}`,
      isError: true,
      errorCode: "no-key",
    });
    return;
  }

  const effortCfg = resolveEffortConfig(effort, plugin.settings.effortConfigs);

  const vaultContextBlock = useVault
    ? await buscarContextoDoVault({
        plugin,
        t,
        effort,
        query: userText,
        addMessage,
        updateActivity,
      })
    : "";

  const commentId = addMessage({
    type: "ai-comment",
    content: "",
    activity: {
      phase: "pending",
      iconPending: "sparkles",
      iconDone: "check",
      pendingText: t.ai.thinking,
      doneText: t.ai.thinking,
    },
  });
  setLoading(true);

  const controller = new AbortController();
  abortRef.current = controller;

  let responseId: string | null = null;
  let reasoningBuf = "";

  try {

    let noteContextBlock = "";
    if (userAttachments) {
      const noteAtts = userAttachments.filter(
        (a): a is NoteAttachment => a.type === "note"
      );

      noteContextBlock = blocoDeNotasAnexadas(noteAtts);
    }
    const agentMdBlock = await loadAgentMd(
      plugin.app,
      plugin.settings.agentInstructionsPath
    );
    const fullSystem = buildChatSystemPrompt({
      persona: useChatStore.getState().sessionPersona,
      base: t.systemPrompt.base,
      vaultSuffix: t.systemPrompt.vaultQaSuffix,
      vaultBlock: vaultContextBlock,
      noteBlock: noteContextBlock,
      instructions: useChatStore.getState().sessionInstructions,
      styleInstruction: resolveStyleInstruction(),
      agentMd: agentMdBlock,
    });
    const history: ProviderMessage[] = [
      { role: "system", content: fullSystem },
      ...storeMessagesToProvider(
        useChatStore.getState().messages,
        userAttachments
      ),
    ];

    const apiKey = apiKeyFor(activeProviderId);
    const maxTokens = effortToMaxTokensSmart(
      effort,
      getContextWindow(activeModel),
      plugin.settings.effortConfigs
    );
    let lastOutputTokens = 0;

    startStreamTimer();
    const response = await activeProvider.streamChat(
      {
        model: activeModel,
        messages: history,
        maxTokens,
        temperature: effortCfg.temperature,
        effort: isEffortLevel(effort) ? effort : undefined,
        onRecovery: () => addMessage({ type: "ai-comment", content: t.ai.recovering }),
      },
      apiKey,
      (token) => {
        if (responseId === null) {
          updateActivity(commentId, { phase: "done" });
          responseId = addMessage({ type: "ai-response", content: token });
          setStreamingMessageId(responseId);

          if (reasoningBuf) {
            useChatStore.getState().appendReasoning(responseId, reasoningBuf);
            reasoningBuf = "";
          }
        } else {
          appendToMessage(responseId, token);
        }
        tickStreamTokens(token);
      },
      (usage) => {
        lastOutputTokens = usage.output;
        addUsage(usage.input, usage.output);
      },
      controller.signal,
      (reasoningDelta) => {

        if (responseId !== null) {
          useChatStore.getState().appendReasoning(responseId, reasoningDelta);
        } else {
          reasoningBuf += reasoningDelta;
        }
      }
    );
    endStreamTimer();
    const issue = responseIssue(response);
    if (issue) {
      updateActivity(commentId, { phase: "failed", iconFailed: "x-circle", failedText: t.ai.failed });
      const errorId = addMessage({
        type: "ai-response",
        content: `${t.ai.errorPrefix} ${t.ai[issue]}`,
        isError: true,
      });
      if (reasoningBuf || (responseId === null && response.reasoning)) {
        useChatStore.getState().appendReasoning(errorId, reasoningBuf || response.reasoning || "");
      }
      if (response.finishReason === "length" || response.streamCompleted === false) {
        useChatStore.getState().setTruncated(responseId ?? errorId, true);
      }
      return;
    }
    if (responseId === null && response.content.trim()) {
      updateActivity(commentId, { phase: "done" });
      responseId = addMessage({ type: "ai-response", content: response.content });
      if (reasoningBuf || response.reasoning) {
        useChatStore.getState().appendReasoning(responseId, reasoningBuf || response.reasoning || "");
      }
    }

    const tetoEnviado = resolveMaxTokens(
      activeProviderId,
      activeModel,
      maxTokens,
      isEffortLevel(effort) ? effort : undefined
    );
    if (
      responseId !== null &&
      response.finishReason === undefined &&
      lastOutputTokens > 0 &&
      lastOutputTokens >= tetoEnviado * 0.95
    ) {
      useChatStore.getState().setTruncated(responseId, true);
    }

  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (responseId === null) {
        updateActivity(commentId, {
          phase: "failed",
          iconFailed: "circle-stop",
          failedText: t.ai.interrupted,
        });
      } else {

        useChatStore.getState().setTruncated(responseId, true);
      }
    } else {
      if (responseId === null) {
        updateActivity(commentId, {
          phase: "failed",
          iconFailed: "x-circle",
          failedText: t.ai.failed,
        });
      }
      const { message, code } = describeProviderError(
        err,
        t,
        activeProvider.name
      );
      const errorId = addMessage({
        type: "ai-response",
        content: `${t.ai.errorPrefix} ${message}`,
        isError: true,
        errorCode: code,
      });
      if (responseId === null && reasoningBuf) {
        useChatStore.getState().appendReasoning(errorId, reasoningBuf);
      }
    }
  } finally {
    setLoading(false);
    setStreamingMessageId(null);
    abortRef.current = null;
  }
}

import { useChatStore } from "../store/chat";
import {
  semCredencial,
  describeProviderError,
  agentActivitySpec,
  summarizeToolResult,
} from "./helpers";
import { resolveEffortConfig, effortToMaxTokensSmart, isEffortLevel } from "./effort";
import { getContextWindow } from "./contextWindows";
import {
  buildAgentSystemPrompt,
  storeMessagesToProvider,
} from "../agent/conversation";
import { decideToolGate } from "../agent/permissions";
import { antesDe, apagarVaiPraLixeira, depoisDe, registrarDesfazer } from "../agent/undo";
import { ConfirmationModal } from "../agent/ConfirmationModal";
import { TOOL_REGISTRY, isTransientError } from "../agent/tools";
import { TOOL_DEFINITIONS, getToolDefinition } from "../agent/toolSchemas";
import {
  makeCallSignature,
  isLooping,
  trimSignatures,
} from "../agent/loopDetection";
import type { MessageAttachment, ProviderMessage } from "../providers/base";
import { responseIssue } from "../providers/base";
import type { AIToolStep, PermissionLevel } from "../agent/types";
import { loadAgentMd } from "./agentMd";
import type { EngineCtx } from "./chatEngine";
import { buscarContextoDoVault } from "./vaultLookup";

export interface AgentCtx extends EngineCtx {

  agentApproveAllRef: { current: boolean };
}

const UNAVAILABLE_TOOLS = new Set(["generate_image"]);

export async function runAgentTurn(
  ctx: AgentCtx,
  userText: string,
  userAttachments?: MessageAttachment[]
): Promise<void> {
  const {
    plugin,
    t,
    abortRef,
    agentApproveAllRef,
    activeProviderId,
    activeProvider,
    activeModel,
    apiKeyFor,
    effort,
    useVault,
  } = ctx;
  const {
    addMessage,
    appendToMessage,
    updateActivity,
    setLoading,
    setStreamingMessageId,
    setAgentSteps,
    addUsage,
    startStreamTimer,
    tickStreamTokens,
    endStreamTimer,
  } = useChatStore.getState();
  void userText; 

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

  if (!activeProvider.supportsTools) {
    addMessage({
      type: "ai-response",
      content: `${t.ai.errorPrefix} ${t.agent.needsOpenAI}`,
    });
    return;
  }

  setLoading(true);
  const commentId = addMessage({
    type: "ai-comment",
    content: "",
    activity: {
      phase: "pending",
      iconPending: "sparkles",
      iconDone: "check",
      pendingText: t.agent.thinking,
      doneText: t.agent.thinking,
    },
  });

  const permissionLevel: PermissionLevel = (plugin.settings
    .agentPermissionLevel || "ask") as PermissionLevel;

  const diffApproval = plugin.settings.agentDiffApproval !== false;
  agentApproveAllRef.current = false;

  let webAprovadaNaRodada = false;

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

  const webLigada = plugin.settings.agentWeb !== false;
  const tavily = (plugin.settings.tavilyApiKey ?? "").trim();
  const foraDaLista = (nome: string) =>
    UNAVAILABLE_TOOLS.has(nome) ||
    ((nome === "web_search" || nome === "web_fetch") && !webLigada) ||
    (nome === "web_search" && !tavily) ||
    (nome === "fetch_reel_transcript" && plugin.settings.instagramReelsEnabled === false);

  const agentMdBlock = await loadAgentMd(
    plugin.app,
    plugin.settings.agentInstructionsPath
  );

  const history: ProviderMessage[] = [
    {
      role: "system",
      content: buildAgentSystemPrompt(
        useChatStore.getState().sessionPersona,
        t.agent.systemPrompt + (webLigada ? t.agent.webPrompt : ""),
        { suffix: t.systemPrompt.vaultQaSuffix, block: vaultContextBlock },
        useChatStore.getState().sessionInstructions,
        agentMdBlock
      ),
    },

    ...storeMessagesToProvider(
      useChatStore.getState().messages,
      userAttachments,
      true
    ),
  ];

  const tools = TOOL_DEFINITIONS.filter((td) => !foraDaLista(td.name)).map((td) => ({
    name: td.name,
    description: td.description,
    parameters: td.parameters,
  }));

  const apiKey = apiKeyFor(activeProviderId);

  const loopWindow = effortCfg.loopDetectionWindow;
  const recentCallSignatures: string[] = [];
  let loopNudges = 0;
  const MAX_LOOP_NUDGES = 3;

  const runSteps: AIToolStep[] = [];

  let firstTurn = true;
  const controller = new AbortController();
  abortRef.current = controller;
  let responseId: string | null = null;
  let reasoningBuf = "";

  try {
    while (true) {

      if (controller.signal.aborted) {
        throw new DOMException("Interrupted", "AbortError");
      }

      responseId = null;
      reasoningBuf = "";
      const onToken = (token: string) => {
        if (responseId === null) {
          if (firstTurn) {
            updateActivity(commentId, { phase: "done" });
            firstTurn = false;
          }
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
      };

      startStreamTimer();
      const response = await activeProvider.streamChat(
        {
          model: activeModel,
          messages: history,
          maxTokens: effortToMaxTokensSmart(
            effort,
            getContextWindow(activeModel),
            plugin.settings.effortConfigs
          ),
          temperature: effortCfg.temperature,
          effort: isEffortLevel(effort) ? effort : undefined,
          tools,
          onRecovery: () => {
            addMessage({
              type: "ai-comment",
              content: t.ai.recovering,
            });
          },
        },
        apiKey,
        onToken,
        (usage) => addUsage(usage.input, usage.output),
        controller.signal,
        (delta) => {
          if (responseId === null) reasoningBuf += delta;
          else useChatStore.getState().appendReasoning(responseId, delta);
        }
      );
      endStreamTimer();
      setStreamingMessageId(null);

      const issue = responseIssue(response);
      if (issue) {
        if (firstTurn) {
          updateActivity(commentId, { phase: "failed", iconFailed: "x-circle", failedText: t.ai.failed });
          firstTurn = false;
        }
        const errorId = addMessage({
          type: "ai-response",
          content: `${t.ai.errorPrefix} ${t.ai[issue]}`,
          isError: true,
        });
        if (responseId === null && (reasoningBuf || response.reasoning)) {
          useChatStore.getState().appendReasoning(errorId, reasoningBuf || response.reasoning || "");
        }
        if (response.finishReason === "length" || response.streamCompleted === false) {
          useChatStore.getState().setTruncated(responseId ?? errorId, true);
        }
        if (runSteps.length) setAgentSteps(errorId, runSteps);
        return;
      }

      if (!response.toolCalls || response.toolCalls.length === 0) {
        if (responseId === null) {
          if (firstTurn) {
            updateActivity(commentId, { phase: "done" });
            firstTurn = false;
          }
          responseId = addMessage({
            type: "ai-response",
            content: response.content,
          });
          if (response.reasoning) {
            useChatStore.getState().appendReasoning(responseId, response.reasoning);
          }
        }
        if (runSteps.length > 0 && responseId) {
          setAgentSteps(responseId, runSteps);
        }
        return;
      }

      if (firstTurn) {
        updateActivity(commentId, { phase: "done" });
        firstTurn = false;
      }
      history.push({
        role: "assistant",
        content: response.content ?? "",
        toolCalls: response.toolCalls,
      });

      let loopDetected = false;
      if (loopWindow > 0) {
        for (const call of response.toolCalls) {
          recentCallSignatures.push(
            makeCallSignature(call.name, call.arguments)
          );
        }
        trimSignatures(recentCallSignatures, loopWindow * 4);
        loopDetected = isLooping(recentCallSignatures, loopWindow);
      }

      type CallResult = {
        callId: string;
        content: string;
        activityId: string;
        spec: ReturnType<typeof agentActivitySpec>;
        meta: string;
        ok: boolean;
      };

      const preparedCalls: Array<{
        call: (typeof response.toolCalls)[number];
        def: ReturnType<typeof getToolDefinition>;
        approved: boolean;
        activityId: string;
        spec: ReturnType<typeof agentActivitySpec>;
      }> = [];
      for (const call of response.toolCalls) {
        if (foraDaLista(call.name)) {
          const resultText = `Tool "${call.name}" is not available in this build. Do NOT retry — tell the user.`;
          addMessage({
            type: "ai-comment",
            content: "",
            activity: {
              phase: "failed",
              iconPending: "wrench",
              iconFailed: "alert-triangle",
              pendingText: t.agent.unknownTool(call.name),
              failedText: t.agent.unknownTool(call.name),
            },
          });
          history.push({ role: "tool", toolCallId: call.id, content: resultText });
          runSteps.push({
            id: call.id,
            name: call.name,
            arguments: call.arguments,
            result: resultText,
            ok: false,
          });
          continue;
        }
        const def = getToolDefinition(call.name);
        if (!def) {
          addMessage({
            type: "ai-comment",
            content: "",
            activity: {
              phase: "failed",
              iconPending: "wrench",
              iconFailed: "alert-triangle",
              pendingText: t.agent.unknownTool(call.name),
              failedText: t.agent.unknownTool(call.name),
            },
          });
          history.push({
            role: "tool",
            toolCallId: call.id,
            content: `Tool "${call.name}" does not exist. Use one of the available tools.`,
          });
          continue;
        }

        const gate = decideToolGate(def, permissionLevel, {
          approveAll: agentApproveAllRef.current,
          approveAllWeb: webAprovadaNaRodada,
          apagarVaiPraLixeira: apagarVaiPraLixeira(plugin.app),
        });
        let approved = gate === "auto";
        if (gate === "confirm") {
          const modal = new ConfirmationModal(plugin.app, {
            toolCall: call,
            definition: def,
            showDiff: diffApproval,
            strings: t.agent,
          });

          const dona =
            useChatStore.getState().background?.chatId ??
            useChatStore.getState().currentChatId;
          useChatStore.getState().setWaitingChatId(dona);
          let res;
          try {
            res = await modal.openAndWait();
          } finally {
            useChatStore.getState().setWaitingChatId(null);
          }
          approved = res.approved;
          if (res.approveAll) {
            if (def.network) webAprovadaNaRodada = true;
            else agentApproveAllRef.current = true;
          }
        }

        if (!approved) {
          addMessage({
            type: "ai-comment",
            content: "",
            activity: {
              phase: "failed",
              iconPending: "shield",
              iconFailed: "ban",
              pendingText: t.agent.deniedTool(call.name),
              failedText: t.agent.deniedTool(call.name),
            },
          });
          history.push({
            role: "tool",
            toolCallId: call.id,
            content:
              "User denied this action. Do NOT repeat this same call — consider another approach or ask the user.",
          });
          continue;
        }

        const spec = agentActivitySpec(call.name, call.arguments);
        const activityId = addMessage({
          type: "ai-comment",
          content: "",
          activity: {
            phase: "pending",
            toolName: call.name,
            toolArguments: call.arguments,
            iconPending: spec.iconPending,
            iconDone: spec.iconDone,
            pendingText: spec.pendingText,
            doneText: spec.doneText,
          },
        });
        preparedCalls.push({ call, def, approved, activityId, spec });
      }

      const execCall = async (
        prep: (typeof preparedCalls)[number]
      ): Promise<CallResult> => {
        const { call, activityId, spec } = prep;
        if (controller.signal.aborted) {
          updateActivity(activityId, {
            phase: "failed",
            iconFailed: "circle-stop",
            failedText: t.ai.interrupted,
          });
          return {
            callId: call.id,
            content: "Interrupted by the user — this call did NOT run.",
            activityId,
            spec,
            meta: "",
            ok: false,
          };
        }
        const executor = TOOL_REGISTRY[call.name];

        let antes: Awaited<ReturnType<typeof antesDe>> = null;
        if (prep.def?.destructive) {
          try {
            antes = await antesDe(plugin.app, call.name, call.arguments);
          } catch (err) {
            console.warn("[corvus] no copy for Undo:", err);
          }
        }
        const maxAttempts = 1 + Math.max(0, effortCfg.toolRetryOnError);
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const result = await executor(
              {
                app: plugin.app,
                vectorIndex: plugin.vectorIndex,
                appDataPaths: [plugin.settings.chatsPath, plugin.settings.ragIndexPath],
                embed: {
                  openaiApiKey: plugin.settings.openaiApiKey,
                  openrouterApiKey: plugin.settings.openrouterApiKey,
                  geminiApiKey: plugin.settings.geminiApiKey,
                  nimApiKey: plugin.settings.nimApiKey,
                  ollamaEndpoint: plugin.settings.ollamaEndpoint,
                },
                web: { tavilyApiKey: tavily },
              },
              call.arguments
            );
            const meta = summarizeToolResult(call.name, result);
            const detail =
              result && result.length > 800
                ? result.slice(0, 800).trimEnd() + "\n…"
                : result || undefined;
            updateActivity(activityId, { phase: "done", detail }, meta);
            if (antes) {
              try {
                const volta = await depoisDe(plugin.app, antes);
                if (volta) {
                  registrarDesfazer(activityId, volta);
                  updateActivity(activityId, { undoId: activityId });
                }
              } catch (err) {
                console.warn("[corvus] Undo not recorded:", err);
              }
            }
            return {
              callId: call.id,
              content: result,
              activityId,
              spec,
              meta,
              ok: true,
            };
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : "";
            if (!isTransientError(msg) || attempt === maxAttempts) break;
          }
        }
        const msg =
          lastErr instanceof Error ? lastErr.message : t.ai.unknownError;
        updateActivity(
          activityId,
          {
            phase: "failed",
            iconFailed: "x-circle",
            failedText: spec.failedText,
          },
          msg
        );
        return {
          callId: call.id,
          content: `ERROR: ${msg}. Do NOT repeat this same call — fix path/args or try another approach.`,
          activityId,
          spec,
          meta: "",
          ok: false,
        };
      };

      let results: CallResult[];
      if (effortCfg.parallelToolCalls && preparedCalls.length > 1) {

        const indexed = preparedCalls.map((prep, idx) => ({ prep, idx }));
        const groups = new Map<string, typeof indexed>();
        for (const item of indexed) {
          const a = item.prep.call.arguments;
          const writeKey = [a.path, a.from, a.to]
            .filter((v) => typeof v === "string" && v)
            .map((v) => String(v).replace(/^\/+|\/+$/g, ""))
            .join("→");
          const key = writeKey || `__solo_${item.idx}`;
          const bucket = groups.get(key);
          if (bucket) bucket.push(item);
          else groups.set(key, [item]);
        }
        results = new Array<CallResult>(preparedCalls.length);
        await Promise.all(
          [...groups.values()].map(async (bucket) => {
            for (const { prep, idx } of bucket) {
              results[idx] = await execCall(prep);
            }
          })
        );
      } else {
        results = [];
        for (const prep of preparedCalls) {
          results.push(await execCall(prep));
        }
      }
      for (const r of results) {
        history.push({
          role: "tool",
          toolCallId: r.callId,
          content: r.content,
        });
        const call = response.toolCalls.find((c) => c.id === r.callId);
        if (call) {
          runSteps.push({
            id: r.callId,
            name: call.name,
            arguments: call.arguments,
            result: r.content.slice(0, 1200),
            ok: r.ok,
          });
        }
      }

      if (controller.signal.aborted) {
        throw new DOMException("Interrupted", "AbortError");
      }

      if (loopDetected) {
        loopNudges++;
        if (loopNudges >= MAX_LOOP_NUDGES) {
          const loopId = addMessage({
            type: "ai-response",
            content: t.agent.loopAborted,
          });
          if (runSteps.length > 0) setAgentSteps(loopId, runSteps);
          return;
        }
        history.push({
          role: "user",
          content:
            "⚠️ You repeated the exact same tool call several times. " +
            "This means your current approach is not working. " +
            "STOP repeating, RECONSIDER your strategy (maybe you need " +
            "additional information — try vault_list/vault_read on another path) " +
            "OR ask the user to clarify. Do not repeat the same call.",
        });
        addMessage({
          type: "ai-comment",
          content: "",
          activity: {
            phase: "failed",
            iconPending: "rotate-cw",
            iconFailed: "alert-triangle",
            pendingText: t.agent.loopDetectedPending,
            failedText: t.agent.loopDetectedDone,
          },
        });
        recentCallSignatures.length = 0;
      }
    }
  } catch (err) {
    if (firstTurn) {
      if (err instanceof DOMException && err.name === "AbortError") {
        updateActivity(commentId, {
          phase: "failed",
          iconFailed: "circle-stop",
          failedText: t.ai.interrupted,
        });
      } else {
        updateActivity(commentId, {
          phase: "failed",
          iconFailed: "x-circle",
          failedText: t.ai.failed,
        });
      }
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      if (!firstTurn) {
        const stopId = addMessage({
          type: "ai-response",
          content: t.ai.interrupted,
        });
        if (runSteps.length > 0) setAgentSteps(stopId, runSteps);
      }
    } else {
      const { message, code } = describeProviderError(
        err,
        t,
        activeProvider.name
      );
      const errId = addMessage({
        type: "ai-response",
        content: `${t.ai.errorPrefix} ${message}`,
        isError: true,
        errorCode: code,
      });
      if (responseId === null && reasoningBuf) {
        useChatStore.getState().appendReasoning(errId, reasoningBuf);
      }
      if (runSteps.length > 0) setAgentSteps(errId, runSteps);
    }
  } finally {
    setLoading(false);
    setStreamingMessageId(null);
    endStreamTimer();
    abortRef.current = null;
  }
}

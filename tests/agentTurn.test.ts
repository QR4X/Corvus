import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentTurn, type AgentCtx } from "../src/core/agentTurn";
import { streamReply } from "../src/core/chatEngine";
import { useChatStore } from "../src/store/chat";
import { TOOL_REGISTRY } from "../src/agent/tools";
import { ConfirmationModal } from "../src/agent/ConfirmationModal";
import { getTranslations } from "../src/i18n";
import { storeMessagesToProvider } from "../src/agent/conversation";
import { type Provider, type ProviderResponse } from "../src/providers/base";
import { openrouterProvider } from "../src/providers/openrouter";
import { fakeStreamResponse, sse } from "./helpers/streamMock";
import { __setRequestUrl } from "./obsidian-stub";

const initial = useChatStore.getState();
const t = getTranslations("en");

function context(provider: Provider, effort = "low"): AgentCtx {

  const plugin = {
    app: { vault: { getConfig: () => "local" } },
    settings: {
      agentPermissionLevel: "ask", agentWeb: true, tavilyApiKey: "test",
      effortConfigs: { low: { agentMaxTurns: 5 }, med: { agentMaxTurns: 12 } },
    },
    vectorIndex: null,
  };
  return {
    plugin: plugin as unknown as AgentCtx["plugin"],
    t, abortRef: { current: null }, agentApproveAllRef: { current: false },
    activeProviderId: provider.id, activeProvider: provider,
    activeModel: "deepseek/deepseek-v4-flash-0731", activeMode: "agent",
    useVault: false, apiKeyFor: () => "key", effort,
    resolveStyleInstruction: () => "",
  };
}

function provider(responses: ProviderResponse[]): Provider {
  return {
    id: "openrouter", name: "Test", supportsTools: true,
    chat: vi.fn(),
    streamChat: vi.fn(async (_req, _key, onToken) => {
      const res = responses.shift();
      if (!res) throw new Error("Unexpected extra model request");
      if (res.content) onToken(res.content);
      return res;
    }),
  };
}

const step = (index: number, name = "vault_list"): ProviderResponse => ({
  content: "",
  toolCalls: [{ id: `call-${index}`, name, arguments: { folder: `folder-${index}` } }],
});

beforeEach(() => {
  useChatStore.setState({ ...initial, messages: [], background: null, tokensIn: 0, tokensOut: 0 });
  useChatStore.getState().addMessage({ type: "user", content: "Research and answer" });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  __setRequestUrl(null);
});

describe("real Agent loop", () => {
  it.each(["low", "med"])("finishes after 14 rounds despite legacy %s turn settings", async (effort) => {
    const execute = vi.spyOn(TOOL_REGISTRY, "vault_list").mockResolvedValue("already listed");
    const p = provider([...Array.from({ length: 13 }, (_, i) => step(i)), { content: "Final answer" }]);
    await runAgentTurn(context(p, effort), "Research and answer");
    expect(p.streamChat).toHaveBeenCalledTimes(14);
    expect(execute).toHaveBeenCalledTimes(13);
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({
      content: "Final answer", agentSteps: expect.arrayContaining([expect.objectContaining({ id: "call-12" })]),
    });
    expect(useChatStore.getState().isLoading).toBe(false);
  });

  it.each([true, false])("retains prior actions and blocks length-limited calls (invalid flag: %s)", async (invalidToolCalls) => {
    const execute = vi.spyOn(TOOL_REGISTRY, "vault_list").mockResolvedValue("already listed");
    const p = provider([step(1), {
      content: "", reasoning: "thinking", finishReason: "length", invalidToolCalls,
      toolCalls: step(2).toolCalls,
    }]);
    await runAgentTurn(context(p), "Research and answer");
    expect(execute).toHaveBeenCalledTimes(1);
    const last = useChatStore.getState().messages.at(-1);
    expect(last).toMatchObject({ isError: true, content: expect.stringContaining(t.ai.outputLimit), truncated: true });
    expect(useChatStore.getState().messages).toContainEqual(expect.objectContaining({ type: "ai-comment", thought: "thinking" }));
    const history = storeMessagesToProvider(useChatStore.getState().messages, undefined, true);
    expect(history.some((m) => m.role === "tool" && m.content === "already listed")).toBe(true);
    expect(history.some((m) => m.content.includes(t.ai.outputLimit))).toBe(false);
  });

  it("keeps loop detection active without a turn cap", async () => {
    const execute = vi.spyOn(TOOL_REGISTRY, "vault_list").mockResolvedValue("same folder");
    const p = provider(Array.from({ length: 12 }, () => step(1)));
    await runAgentTurn(context(p), "Research and answer");
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({ content: t.agent.loopAborted });
    expect(execute.mock.calls.length).toBeLessThan(12);
  });

  it("still asks for web permission and does not execute denied calls", async () => {
    const confirm = vi.spyOn(ConfirmationModal.prototype, "openAndWait").mockResolvedValue({ approved: false, approveAll: false });
    const execute = vi.spyOn(TOOL_REGISTRY, "web_fetch");
    const p = provider([{
      content: "", toolCalls: [{ id: "web-1", name: "web_fetch", arguments: { url: "https://example.com" } }],
    }, { content: "Permission denied" }]);
    await runAgentTurn(context(p), "Research and answer");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("Stop between tools prevents the next model round", async () => {
    const p = provider([step(1), { content: "must not run" }]);
    const ctx = context(p);
    vi.spyOn(TOOL_REGISTRY, "vault_list").mockImplementation(async () => {
      ctx.abortRef.current?.abort();
      return "listed before stopping";
    });
    await runAgentTurn(ctx, "Research and answer");
    expect(p.streamChat).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({ content: t.ai.interrupted });
  });

  it("actual OpenRouter recovery after tools does not execute earlier actions twice", async () => {
    const first = [
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "list-1", function: { name: "vault_list", arguments: "{}" } }] } }] }),
      "data: [DONE]\n\n",
    ];
    const second = [
      sse({ choices: [{ delta: { reasoning: "thinking" } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "length" }], usage: { prompt_tokens: 10, completion_tokens: 8192 } }),
      "data: [DONE]\n\n",
    ];
    const fetch = vi.fn()
      .mockResolvedValueOnce(fakeStreamResponse(first))
      .mockResolvedValueOnce(fakeStreamResponse(second));
    vi.stubGlobal("window", { fetch });
    const execute = vi.spyOn(TOOL_REGISTRY, "vault_list").mockResolvedValue("already listed");
    const native = vi.fn(async () => ({
      status: 200, json: { choices: [{ message: { content: "Recovered answer" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 10 } },
    }));
    __setRequestUrl(native);
    await runAgentTurn(context(openrouterProvider), "Research and answer");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(native).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({ content: "Recovered answer" });
    expect(useChatStore.getState().tokensOut).toBe(8202);
    expect(useChatStore.getState().messages.some((m) => "content" in m && m.content === t.ai.recovering)).toBe(true);
  });

  it("keeps completed actions when the engine runs in the background", async () => {
    const st = useChatStore.getState();
    st.detachTurn({
      chatId: "background", title: "Research", mode: "agent", provider: "openrouter",
      model: "deepseek/deepseek-v4-flash-0731", effort: "low",
      messages: st.messages, tokensIn: 0, tokensOut: 0, scrollTop: 0,
    });
    st.setMessages([]);
    vi.spyOn(TOOL_REGISTRY, "vault_list").mockResolvedValue("already listed");
    await runAgentTurn(context(provider([step(1), { content: "", reasoning: "thinking", finishReason: "length" }])), "Research and answer");
    expect(useChatStore.getState().messages).toHaveLength(0);
    const messages = useChatStore.getState().background!.messages;
    expect(messages.at(-1)).toMatchObject({ isError: true, agentSteps: [expect.objectContaining({ id: "call-1" })] });
    expect(storeMessagesToProvider(messages, undefined, true).some((m) => m.role === "tool")).toBe(true);
  });
});

describe("Chat uses the same response diagnostics", () => {
  it("reasoning-only is an explicit error, not a successful blank reply", async () => {
    await streamReply(context(provider([{ content: "", reasoning: "thinking", finishReason: "stop" }])), "Question");
    const last = useChatStore.getState().messages.at(-1);
    expect(last).toMatchObject({ isError: true, content: expect.stringContaining(t.ai.emptyResponse) });
    expect(useChatStore.getState().messages).toContainEqual(expect.objectContaining({ type: "ai-comment", thought: "thinking" }));
    expect(last).not.toHaveProperty("truncated", true);
  });

  it("retains partial text when the stream ends early", async () => {
    await streamReply(context(provider([{ content: "Partial answer", streamCompleted: false }])), "Question");
    expect(useChatStore.getState().messages).toContainEqual(expect.objectContaining({ content: "Partial answer", truncated: true }));
    expect(useChatStore.getState().messages.at(-1)).toMatchObject({ isError: true, content: expect.stringContaining(t.ai.streamIncomplete) });
  });
});

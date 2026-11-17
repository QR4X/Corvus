import { describe, it, expect, vi, afterEach } from "vitest";
import { openaiProvider } from "../src/providers/openai";
import { geminiProvider } from "../src/providers/gemini";
import { anthropicProvider } from "../src/providers/anthropic";
import { openrouterProvider } from "../src/providers/openrouter";
import { ollamaProvider } from "../src/providers/ollama";
import { nimProvider } from "../src/providers/nim";
import { fakeStreamResponse, sse } from "./helpers/streamMock";
import { __setRequestUrl } from "./obsidian-stub";
import { parseOpenAICompatSSE } from "../src/providers/_shared";
import { responseIssue } from "../src/providers/base";

const userReq = (model: string) => ({
  model,
  messages: [{ role: "user" as const, content: "hi" }],
});

describe("SSE completion diagnostics", () => {
  const parse = (chunks: string[]) => parseOpenAICompatSSE(
    fakeStreamResponse(chunks).body!, () => {}, undefined, "test_call"
  );

  it("reads the final event without a newline and retains length", async () => {
    const res = await parse([
      sse({ choices: [{ delta: { reasoning: "thinking" } }] }),
      'data: {"choices":[{"delta":{},"finish_reason":"length"}]}',
    ]);
    expect(res.reasoning).toBe("thinking");
    expect(res.finishReason).toBe("length");
    expect(res.streamCompleted).toBe(true);
    expect(responseIssue(res)).toBe("outputLimit");
  });

  describe("native compatible providers reject malformed tool arguments explicitly", () => {
    afterEach(() => __setRequestUrl(null));
    it.each([openaiProvider, geminiProvider, nimProvider])("$id does not turn a malformed batch into success text", async (provider) => {
      __setRequestUrl(async () => ({ status: 200, json: { choices: [{ message: {
        content: "I will edit your note",
        tool_calls: [{ type: "function", id: "x", function: { name: "vault_edit", arguments: '{"path":' } }],
      } }] } }));
      await expect(provider.chat(userReq("test"), "key")).rejects.toMatchObject({
        name: "ProviderError", message: expect.stringContaining("invalid tool-call arguments"),
      });
    });
  });

  it("distinguishes reasoning-only completion from premature EOF", async () => {
    const reasoning = sse({ choices: [{ delta: { reasoning: "thinking" } }] });
    expect(responseIssue(await parse([reasoning, "data: [DONE]"]))).toBe("emptyResponse");
    expect(responseIssue(await parse([reasoning]))).toBe("streamIncomplete");
  });

  it("retains partial text and releases the stream reader", async () => {
    const body = fakeStreamResponse([sse({ choices: [{ delta: { content: "partial" } }] })]).body!;
    const res = await parseOpenAICompatSSE(body, () => {}, undefined, "test");
    expect(res.content).toBe("partial");
    expect(responseIssue(res)).toBe("streamIncomplete");
    expect(body.locked).toBe(false);
  });

  it("a reader network failure keeps reasoning and reports an incomplete stream", async () => {
    let sent = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          sent = true;
          controller.enqueue(new TextEncoder().encode(sse({ choices: [{ delta: { reasoning: "thinking" } }] })));
        } else controller.error(new TypeError("Network connection lost"));
      },
    });
    const res = await parseOpenAICompatSSE(body, () => {}, undefined, "test");
    expect(res.reasoning).toBe("thinking");
    expect(responseIssue(res)).toBe("streamIncomplete");
    expect(body.locked).toBe(false);
  });

  it.each(["length", null])("never executes a tool batch from an unfinished response (%s)", async (finish_reason) => {
    const res = await parse([sse({ choices: [{
      delta: { tool_calls: [{ index: 0, id: "x", function: { name: "vault_edit", arguments: '{"path":"a.md"}' } }] },
      finish_reason,
    }] })]);
    expect(res.toolCalls).toBeUndefined();
    expect(res.invalidToolCalls).toBe(true);
  });

  it("rejects malformed tool JSON even on a completed stream", async () => {
    const res = await parse([
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "web_fetch", arguments: '{"url":' } }] } }] }),
      "data: [DONE]\n\n",
    ]);
    expect(res.toolCalls).toBeUndefined();
    expect(responseIssue(res)).toBe("invalidToolResponse");
  });
});

function stubFetch(fn: (...args: never[]) => unknown) {
  vi.stubGlobal("fetch", fn);
  vi.stubGlobal("window", { fetch: fn });
}

function mockFetch(chunks: string[], init?: { status?: number; ok?: boolean }) {
  stubFetch(vi.fn(async () => fakeStreamResponse(chunks, init)));
}

describe("openai streamChat SSE parser", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accumulates content deltas in order with usage and stops at [DONE]", async () => {
    mockFetch([
      sse({ choices: [{ delta: { content: "Hello" } }] }),
      sse({ choices: [{ delta: { content: ", world" } }] }),
      sse({ choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      "data: [DONE]\n\n",
    ]);
    const tokens: string[] = [];
    let usage: unknown;
    const res = await openaiProvider.streamChat(
      userReq("gpt-4o"),
      "key",
      (t) => tokens.push(t),
      (u) => (usage = u)
    );
    expect(tokens).toEqual(["Hello", ", world"]);
    expect(res.content).toBe("Hello, world");
    expect(usage).toEqual({ input: 10, output: 5 });
    expect(res.usage).toEqual({ input: 10, output: 5 });
  });

  it("reassembles a JSON event split across two reads", async () => {
    mockFetch([
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"}}]}\n\ndata: [DONE]\n\n',
    ]);
    const tokens: string[] = [];
    const res = await openaiProvider.streamChat(userReq("gpt-4o"), "key", (t) =>
      tokens.push(t)
    );
    expect(res.content).toBe("Hello");
    expect(tokens).toEqual(["Hello"]);
  });

  it("builds tool_calls from indexed deltas by concatenating and parsing arguments", async () => {
    mockFetch([
      sse({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call_1", function: { name: "get_weather", arguments: '{"ci' } },
              ],
            },
          },
        ],
      }),
      sse({
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { arguments: 'ty":"SP"}' } }] } },
        ],
      }),
      "data: [DONE]\n\n",
    ]);
    const res = await openaiProvider.streamChat(userReq("gpt-4o"), "key", () => {});
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls![0]).toMatchObject({
      id: "call_1",
      name: "get_weather",
      arguments: { city: "SP" },
    });
  });

  it("routes reasoning and reasoning_content to onReasoning without polluting content", async () => {
    mockFetch([
      sse({ choices: [{ delta: { reasoning: "thinking" } }] }),
      sse({ choices: [{ delta: { reasoning_content: " more" } }] }),
      sse({ choices: [{ delta: { content: "Answer" } }] }),
      "data: [DONE]\n\n",
    ]);
    const tokens: string[] = [];
    const reasoning: string[] = [];
    const res = await openaiProvider.streamChat(
      userReq("gpt-4o"),
      "key",
      (t) => tokens.push(t),
      undefined,
      undefined,
      (r) => reasoning.push(r)
    );
    expect(reasoning).toEqual(["thinking", " more"]);
    expect(tokens).toEqual(["Answer"]);
    expect(res.content).toBe("Answer");
  });

  it("without onReasoning, reasoning deltas neither break the stream nor enter content", async () => {
    mockFetch([
      sse({ choices: [{ delta: { reasoning: "hidden" } }] }),
      sse({ choices: [{ delta: { content: "ok" } }] }),
      "data: [DONE]\n\n",
    ]);
    const res = await openaiProvider.streamChat(userReq("gpt-4o"), "key", () => {});
    expect(res.content).toBe("ok");
  });

  it("keeps the order of each channel when reasoning and content interleave", async () => {
    mockFetch([
      sse({ choices: [{ delta: { reasoning: "r1" } }] }),
      sse({ choices: [{ delta: { content: "c1" } }] }),
      sse({ choices: [{ delta: { reasoning: "r2" } }] }),
      sse({ choices: [{ delta: { content: "c2" } }] }),
      "data: [DONE]\n\n",
    ]);
    const tokens: string[] = [];
    const reasoning: string[] = [];
    const res = await openaiProvider.streamChat(
      userReq("gpt-4o"), "key",
      (t) => tokens.push(t), undefined, undefined, (r) => reasoning.push(r)
    );
    expect(reasoning).toEqual(["r1", "r2"]);
    expect(tokens).toEqual(["c1", "c2"]);
    expect(res.content).toBe("c1c2");
  });

  it("prefers reasoning over reasoning_content in the same delta", async () => {
    mockFetch([
      sse({ choices: [{ delta: { reasoning: "A", reasoning_content: "B", content: "x" } }] }),
      "data: [DONE]\n\n",
    ]);
    const reasoning: string[] = [];
    const res = await openaiProvider.streamChat(
      userReq("gpt-4o"), "key", () => {}, undefined, undefined, (r) => reasoning.push(r)
    );
    expect(reasoning).toEqual(["A"]);
    expect(res.content).toBe("x");
  });

  it("ignores empty reasoning strings", async () => {
    mockFetch([
      sse({ choices: [{ delta: { reasoning: "" } }] }),
      sse({ choices: [{ delta: { content: "ok" } }] }),
      "data: [DONE]\n\n",
    ]);
    const reasoning: string[] = [];
    await openaiProvider.streamChat(
      userReq("gpt-4o"), "key", () => {}, undefined, undefined, (r) => reasoning.push(r)
    );
    expect(reasoning).toEqual([]);
  });

  it("skips a chunk with invalid JSON without aborting the stream", async () => {
    mockFetch([
      "data: not-json\n\n",
      sse({ choices: [{ delta: { content: "ok" } }] }),
      "data: [DONE]\n\n",
    ]);
    const res = await openaiProvider.streamChat(userReq("gpt-4o"), "key", () => {});
    expect(res.content).toBe("ok");
  });

  it("maps HTTP 401 to a ProviderError with invalid-key", async () => {
    mockFetch([], { status: 401, ok: false });
    await expect(
      openaiProvider.streamChat(userReq("gpt-4o"), "key", () => {})
    ).rejects.toMatchObject({ code: "invalid-key" });
  });

  it("rejects with no-key before fetching when the API key is blank", async () => {
    await expect(
      openaiProvider.streamChat(userReq("gpt-4o"), "   ", () => {})
    ).rejects.toMatchObject({ code: "no-key" });
  });
});

describe("gemini streamChat in OpenAI-compatible format", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accumulates content and usage until [DONE]", async () => {
    mockFetch([
      sse({ choices: [{ delta: { content: "Hi" } }] }),
      sse({ choices: [{ delta: { content: " world" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }),
      "data: [DONE]\n\n",
    ]);
    const tokens: string[] = [];
    let usage: unknown;
    const res = await geminiProvider.streamChat(
      userReq("gemini-2.5-flash"),
      "key",
      (t) => tokens.push(t),
      (u) => (usage = u)
    );
    expect(res.content).toBe("Hi world");
    expect(tokens).toEqual(["Hi", " world"]);
    expect(usage).toEqual({ input: 3, output: 2 });
  });
});

describe("anthropic streamChat typed events", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accumulates text_delta with usage from message_start and message_delta until message_stop", async () => {
    mockFetch([
      sse({ type: "message_start", message: { usage: { input_tokens: 12 } } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " there" } }),
      sse({ type: "message_delta", usage: { output_tokens: 7 } }),
      sse({ type: "message_stop" }),
    ]);
    const tokens: string[] = [];
    let usage: unknown;
    const res = await anthropicProvider.streamChat(
      userReq("claude-opus-4-8"),
      "key",
      (t) => tokens.push(t),
      (u) => (usage = u)
    );
    expect(tokens).toEqual(["Hi", " there"]);
    expect(res.content).toBe("Hi there");
    expect(usage).toEqual({ input: 12, output: 7 });
  });

  it("routes thinking_delta to onReasoning without entering content", async () => {
    mockFetch([
      sse({ type: "message_start", message: { usage: { input_tokens: 4 } } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } }),
      sse({ type: "message_delta", usage: { output_tokens: 2 } }),
      sse({ type: "message_stop" }),
    ]);
    const tokens: string[] = [];
    const reasoning: string[] = [];
    const res = await anthropicProvider.streamChat(
      userReq("claude-opus-4-8"),
      "key",
      (t) => tokens.push(t),
      undefined,
      undefined,
      (r) => reasoning.push(r)
    );
    expect(reasoning).toEqual(["hmm"]);
    expect(tokens).toEqual(["Hi"]);
    expect(res.content).toBe("Hi");
  });

  it("parses a tool_use from content_block_start and concatenated input_json_delta", async () => {
    mockFetch([
      sse({ type: "message_start", message: { usage: { input_tokens: 5 } } }),
      sse({
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_1", name: "search" },
      }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"q":' } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"cats"}' } }),
      sse({ type: "message_delta", usage: { output_tokens: 3 } }),
      sse({ type: "message_stop" }),
    ]);
    const res = await anthropicProvider.streamChat(
      userReq("claude-opus-4-8"),
      "key",
      () => {}
    );
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls![0]).toMatchObject({
      id: "toolu_1",
      name: "search",
      arguments: { q: "cats" },
    });
  });

  it("concatenates several thinking_delta events before text and keeps content clean", async () => {
    mockFetch([
      sse({ type: "message_start", message: { usage: { input_tokens: 4 } } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "step1 " } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "step2" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Answer" } }),
      sse({ type: "message_stop" }),
    ]);
    const reasoning: string[] = [];
    const res = await anthropicProvider.streamChat(
      userReq("claude-opus-4-8"), "key", () => {}, undefined, undefined, (r) => reasoning.push(r)
    );
    expect(reasoning.join("")).toBe("step1 step2");
    expect(res.content).toBe("Answer");
  });

  it("handles thinking_delta without onReasoning and keeps content intact", async () => {
    mockFetch([
      sse({ type: "message_start", message: { usage: { input_tokens: 1 } } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "x" } }),
      sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }),
      sse({ type: "message_stop" }),
    ]);
    const res = await anthropicProvider.streamChat(userReq("claude-opus-4-8"), "key", () => {});
    expect(res.content).toBe("ok");
  });

  it("throws a ProviderError on a type:error stream event", async () => {
    mockFetch([
      sse({ type: "message_start", message: { usage: { input_tokens: 1 } } }),
      sse({ type: "error", error: { message: "overloaded" } }),
    ]);
    await expect(
      anthropicProvider.streamChat(userReq("claude-opus-4-8"), "key", () => {})
    ).rejects.toMatchObject({ name: "ProviderError" });
  });
});

describe("openrouter streamChat in OpenAI-compatible format over fetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __setRequestUrl(null);
  });

  it("recovers reasoning-only once, keeps history and accounts both requests", async () => {
    mockFetch([
      sse({ choices: [{ delta: { reasoning: "thinking" } }] }),
      sse({ choices: [{ delta: {}, finish_reason: "length" }], usage: { prompt_tokens: 10, completion_tokens: 8192 } }),
      "data: [DONE]\n\n",
    ]);
    const chat = vi.spyOn(openrouterProvider, "chat").mockResolvedValue({
      content: "answer", finishReason: "stop", usage: { input: 10, output: 50 },
    });
    const onRecovery = vi.fn();
    const onUsage = vi.fn();
    const req = { ...userReq("deepseek/deepseek-v4-flash-0731"), maxTokens: 512, effort: "low" as const, onRecovery };
    const res = await openrouterProvider.streamChat(req, "key", () => {}, onUsage);
    expect(res.content).toBe("answer");
    expect(chat).toHaveBeenCalledTimes(1);
    expect(chat.mock.calls[0][0]).toMatchObject({ messages: req.messages, maxTokens: 8192 });
    expect(onRecovery).toHaveBeenCalledTimes(1);
    expect(onUsage.mock.calls).toEqual([[{ input: 10, output: 8192 }], [{ input: 10, output: 50 }]]);
  });

  it("two empty responses stop after exactly one recovery", async () => {
    mockFetch(["data: [DONE]\n\n"]);
    const chat = vi.spyOn(openrouterProvider, "chat").mockResolvedValue({ content: "", reasoning: "still thinking", finishReason: "length" });
    const res = await openrouterProvider.streamChat(userReq("deepseek/deepseek-v4-flash-0731"), "key", () => {});
    expect(chat).toHaveBeenCalledTimes(1);
    expect(responseIssue(res)).toBe("outputLimit");
  });

  it.each([
    { error: { message: "Rate limit exceeded" } },
    { error: { message: "Maximum context length exceeded" } },
  ])("does not retry explicit provider stream errors", async (payload) => {
    mockFetch([sse(payload)]);
    const chat = vi.spyOn(openrouterProvider, "chat");
    await expect(openrouterProvider.streamChat(userReq("x"), "key", () => {})).rejects.toMatchObject({ name: "ProviderError" });
    expect(chat).not.toHaveBeenCalled();
  });

  it("does not retry HTTP authentication errors", async () => {
    mockFetch([], { status: 401, ok: false });
    const chat = vi.spyOn(openrouterProvider, "chat");
    await expect(openrouterProvider.streamChat(userReq("x"), "key", () => {})).rejects.toMatchObject({ code: "invalid-key" });
    expect(chat).not.toHaveBeenCalled();
  });

  it("does not restart a stream that already displayed partial text", async () => {
    mockFetch([sse({ choices: [{ delta: { content: "partial" } }] })]);
    const chat = vi.spyOn(openrouterProvider, "chat");
    const res = await openrouterProvider.streamChat(userReq("x"), "key", () => {});
    expect(res.content).toBe("partial");
    expect(responseIssue(res)).toBe("streamIncomplete");
    expect(chat).not.toHaveBeenCalled();
  });

  it("does not recover a valid tool response", async () => {
    mockFetch([
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "x", function: { name: "vault_read", arguments: '{"path":"a.md"}' } }] } }] }),
      "data: [DONE]\n\n",
    ]);
    const chat = vi.spyOn(openrouterProvider, "chat");
    const res = await openrouterProvider.streamChat(userReq("deepseek/deepseek-v4-flash-0731"), "key", () => {});
    expect(res.toolCalls).toHaveLength(1);
    expect(chat).not.toHaveBeenCalled();
  });

  it("Stop before recovery prevents the extra request", async () => {
    mockFetch([sse({ choices: [{ delta: { reasoning: "thinking" } }] }), "data: [DONE]\n\n"]);
    const chat = vi.spyOn(openrouterProvider, "chat");
    const ctrl = new AbortController();
    await expect(openrouterProvider.streamChat(userReq("x"), "key", () => {}, undefined, ctrl.signal, () => ctrl.abort()))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(chat).not.toHaveBeenCalled();
  });

  it("Stop during native recovery suppresses its result", async () => {
    mockFetch(["data: [DONE]\n\n"]);
    const ctrl = new AbortController();
    vi.spyOn(openrouterProvider, "chat").mockImplementation(async () => {
      ctrl.abort();
      return { content: "late answer" };
    });
    const onToken = vi.fn();
    await expect(openrouterProvider.streamChat(userReq("x"), "key", onToken, undefined, ctrl.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(onToken).not.toHaveBeenCalled();
  });

  it("nonstream retains finish_reason and rejects incomplete tool batches", async () => {
    __setRequestUrl(async () => ({ status: 200, json: { choices: [{
      message: { content: "", reasoning: "thinking", tool_calls: [{ type: "function", id: "x", function: { name: "vault_edit", arguments: '{"path":' } }] },
      finish_reason: "length",
    }] } }));
    const res = await openrouterProvider.chat(userReq("x"), "key");
    expect(res.reasoning).toBe("thinking");
    expect(res.finishReason).toBe("length");
    expect(res.toolCalls).toBeUndefined();
    expect(res.invalidToolCalls).toBe(true);
  });

  it("accumulates content and usage until [DONE]", async () => {
    mockFetch([
      sse({ choices: [{ delta: { content: "Hello" } }] }),
      sse({ choices: [{ delta: { content: " OR" } }], usage: { prompt_tokens: 4, completion_tokens: 2 } }),
      "data: [DONE]\n\n",
    ]);
    const tokens: string[] = [];
    let usage: unknown;
    const res = await openrouterProvider.streamChat(
      userReq("anthropic/claude-sonnet-4"),
      "key",
      (t) => tokens.push(t),
      (u) => (usage = u)
    );
    expect(res.content).toBe("Hello OR");
    expect(tokens).toEqual(["Hello", " OR"]);
    expect(usage).toEqual({ input: 4, output: 2 });
  });

  it("routes OpenRouter reasoning to onReasoning", async () => {
    mockFetch([
      sse({ choices: [{ delta: { reasoning: "deep" } }] }),
      sse({ choices: [{ delta: { content: "ans" } }] }),
      "data: [DONE]\n\n",
    ]);
    const reasoning: string[] = [];
    const res = await openrouterProvider.streamChat(
      userReq("deepseek/deepseek-r1"), "key",
      () => {}, undefined, undefined, (r) => reasoning.push(r)
    );
    expect(reasoning).toEqual(["deep"]);
    expect(res.content).toBe("ans");
    expect(res.reasoning).toBe("deep");
  });

  it("throws a ProviderError on an OpenRouter SSE error event", async () => {
    mockFetch([
      sse({ error: { message: "Provider stream terminated unexpectedly" } }),
    ]);
    await expect(
      openrouterProvider.streamChat(userReq("anthropic/claude-sonnet-4"), "key", () => {})
    ).rejects.toMatchObject({
      name: "ProviderError",
      message: expect.stringContaining("Provider stream terminated unexpectedly"),
    });
  });

  it("falls back to chat() when the stream closes with no content, tools or reasoning", async () => {
    mockFetch([
      "data: [DONE]\n\n",
    ]);
    const spyChat = vi.spyOn(openrouterProvider, "chat").mockResolvedValue({ content: "answer via chat fallback" });
    const tokens: string[] = [];
    const res = await openrouterProvider.streamChat(
      userReq("openrouter/auto"),
      "key",
      (t) => tokens.push(t)
    );
    expect(spyChat).toHaveBeenCalled();
    expect(res.content).toBe("answer via chat fallback");
    expect(tokens).toEqual(["answer via chat fallback"]);
    spyChat.mockRestore();
  });
});

describe("ollama streamChat NDJSON with one JSON line per chunk", () => {
  afterEach(() => vi.unstubAllGlobals());

  const ndjson = (obj: unknown) => JSON.stringify(obj) + "\n";

  it("accumulates content and reads usage on done:true", async () => {
    mockFetch([
      ndjson({ message: { content: "Hi" }, done: false }),
      ndjson({ message: { content: " world" }, done: false }),
      ndjson({ message: { content: "" }, done: true, prompt_eval_count: 5, eval_count: 2 }),
    ]);
    const tokens: string[] = [];
    let usage: unknown;
    const res = await ollamaProvider.streamChat(
      userReq("llama3.2"),
      "http://localhost:11434",
      (t) => tokens.push(t),
      (u) => (usage = u)
    );
    expect(res.content).toBe("Hi world");
    expect(tokens).toEqual(["Hi", " world"]);
    expect(usage).toEqual({ input: 5, output: 2 });
  });

  it("reassembles an NDJSON line split across two reads", async () => {
    mockFetch([
      '{"message":{"content":"Re',
      'cursion"},"done":false}\n{"message":{"content":""},"done":true,"prompt_eval_count":1,"eval_count":1}\n',
    ]);
    const res = await ollamaProvider.streamChat(
      userReq("llama3.2"),
      "http://localhost:11434",
      () => {}
    );
    expect(res.content).toBe("Recursion");
  });

  it("turns whole tool_calls with object arguments into toolCalls", async () => {
    mockFetch([
      ndjson({
        message: { content: "", tool_calls: [{ function: { name: "search", arguments: { q: "cats" } } }] },
        done: false,
      }),
      ndjson({ message: { content: "" }, done: true, prompt_eval_count: 1, eval_count: 1 }),
    ]);
    const res = await ollamaProvider.streamChat(
      userReq("llama3.2"),
      "http://localhost:11434",
      () => {}
    );
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls![0]).toMatchObject({ name: "search", arguments: { q: "cats" } });
  });
});

describe("nim streamChat pseudo-stream over requestUrl", () => {
  afterEach(() => __setRequestUrl(null));

  it("emits the whole content as a single token with usage", async () => {
    __setRequestUrl(async () => ({
      status: 200,
      json: {
        choices: [{ message: { content: "full answer" } }],
        usage: { prompt_tokens: 8, completion_tokens: 3 },
      },
    }));
    const tokens: string[] = [];
    let usage: unknown;
    const res = await nimProvider.streamChat(
      userReq("meta/llama-3.1-8b-instruct"),
      "key",
      (t) => tokens.push(t),
      (u) => (usage = u)
    );
    expect(tokens).toEqual(["full answer"]);
    expect(res.content).toBe("full answer");
    expect(usage).toEqual({ input: 8, output: 3 });
  });

  it("rejects with AbortError without calling requestUrl when the signal is already aborted", async () => {
    const spy = vi.fn(async () => ({ status: 200, json: {} }));
    __setRequestUrl(spy);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      nimProvider.streamChat(
        userReq("meta/llama-3.1-8b-instruct"),
        "key",
        () => {},
        undefined,
        ctrl.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps HTTP 401 to a ProviderError with invalid-key", async () => {
    __setRequestUrl(async () => ({ status: 401, json: {} }));
    await expect(
      nimProvider.streamChat(userReq("meta/llama-3.1-8b-instruct"), "key", () => {})
    ).rejects.toMatchObject({ code: "invalid-key" });
  });
});

describe("streamChat falls back to chat() when the SSE fetch fails, as with mobile CORS", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __setRequestUrl(null);
  });

  function mockFetchThrows() {
    stubFetch(
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
  }

  it("openai pseudo-streams content and usage over requestUrl when fetch fails", async () => {
    mockFetchThrows();
    __setRequestUrl(async () => ({
      status: 200,
      json: {
        choices: [{ message: { content: "answer via fallback" } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      },
    }));
    const tokens: string[] = [];
    let usage: unknown;
    const res = await openaiProvider.streamChat(
      userReq("gpt-4o"),
      "key",
      (t) => tokens.push(t),
      (u) => (usage = u)
    );
    expect(tokens).toEqual(["answer via fallback"]);
    expect(res.content).toBe("answer via fallback");
    expect(usage).toEqual({ input: 12, output: 4 });
  });

  it("anthropic pseudo-streams content blocks over requestUrl when fetch fails", async () => {
    mockFetchThrows();
    __setRequestUrl(async () => ({
      status: 200,
      json: {
        content: [{ type: "text", text: "claude via fallback" }],
        usage: { input_tokens: 9, output_tokens: 5 },
      },
    }));
    const tokens: string[] = [];
    const res = await anthropicProvider.streamChat(
      userReq("claude-sonnet-4-6"),
      "key",
      (t) => tokens.push(t)
    );
    expect(tokens).toEqual(["claude via fallback"]);
    expect(res.content).toBe("claude via fallback");
    expect(res.usage).toEqual({ input: 9, output: 5 });
  });

  it("openrouter pseudo-streams over requestUrl when fetch fails", async () => {
    mockFetchThrows();
    __setRequestUrl(async () => ({
      status: 200,
      json: {
        choices: [{ message: { content: "via openrouter" } }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      },
    }));
    const tokens: string[] = [];
    const res = await openrouterProvider.streamChat(
      userReq("anthropic/claude-3.5-sonnet"),
      "key",
      (t) => tokens.push(t)
    );
    expect(tokens).toEqual(["via openrouter"]);
    expect(res.content).toBe("via openrouter");
  });
});

describe("param policy applied to the real request body", () => {
  afterEach(() => vi.unstubAllGlobals());

  function captureBody(chunks: string[]) {
    const cap: { body?: Record<string, unknown> } = {};
    stubFetch(
      vi.fn(async (_url: string, init: { body: string }) => {
        cap.body = JSON.parse(init.body);
        return fakeStreamResponse(chunks);
      })
    );
    return cap;
  }
  const reqT = (model: string, temperature: number) => ({
    model,
    messages: [{ role: "user" as const, content: "hi" }],
    temperature,
  });

  it("sends temperature for gpt-4o", async () => {
    const cap = captureBody(["data: [DONE]\n\n"]);
    await openaiProvider.streamChat(reqT("gpt-4o", 0.3), "key", () => {});
    expect(cap.body?.temperature).toBe(0.3);
  });

  it("omits temperature for reasoning model o3-mini to avoid a 400", async () => {
    const cap = captureBody(["data: [DONE]\n\n"]);
    await openaiProvider.streamChat(reqT("o3-mini", 0.3), "key", () => {});
    expect(cap.body?.temperature).toBeUndefined();
  });

  it("clamps temperature above 1 to 1 for Claude models that accept it", async () => {
    const cap = captureBody([
      sse({ type: "message_start", message: { usage: { input_tokens: 1 } } }),
      sse({ type: "message_stop" }),
    ]);
    await anthropicProvider.streamChat(reqT("claude-sonnet-4-6", 1.7), "key", () => {});
    expect(cap.body?.temperature).toBe(1);
  });

  it("omits temperature for current Claude models that would reject it with a 400", async () => {
    const cap = captureBody([
      sse({ type: "message_start", message: { usage: { input_tokens: 1 } } }),
      sse({ type: "message_stop" }),
    ]);
    await anthropicProvider.streamChat(reqT("claude-opus-4-8", 0.7), "key", () => {});
    expect(cap.body).toBeDefined();
    expect(cap.body).not.toHaveProperty("temperature");
  });
});

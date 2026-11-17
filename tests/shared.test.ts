import { describe, it, expect } from "vitest";
import {
  mapHttpError,
  buildChatBody,
  parseOpenAIChatMessage,
} from "../src/providers/_shared";

const userReq = (extra: Record<string, unknown> = {}) => ({
  model: "gpt-4o",
  messages: [{ role: "user" as const, content: "hi" }],
  ...extra,
});

describe("mapHttpError", () => {
  it("returns null for 2xx", () => {
    expect(mapHttpError(200, {}, { label: "X" })).toBeNull();
  });
  it("maps 401 to invalid-key", () => {
    expect(mapHttpError(401, {}, { label: "X" })?.code).toBe("invalid-key");
  });
  it("maps 403 to invalid-key only when listed in authStatuses", () => {
    expect(mapHttpError(403, {}, { label: "X" })?.code).toBe("unknown");
    expect(
      mapHttpError(403, {}, { label: "X", authStatuses: [401, 403] })?.code
    ).toBe("invalid-key");
  });
  it("maps 429 to rate-limit", () => {
    expect(mapHttpError(429, {}, { label: "X" })?.code).toBe("rate-limit");
  });
  it("maps transient 5xx and 408 errors, including 529 overloaded, to rate-limit", () => {
    expect(mapHttpError(500, {}, { label: "X" })?.code).toBe("rate-limit");
    expect(mapHttpError(503, {}, { label: "X" })?.code).toBe("rate-limit");
    expect(mapHttpError(529, {}, { label: "X" })?.code).toBe("rate-limit");
    expect(mapHttpError(408, {}, { label: "X" })?.code).toBe("rate-limit");
  });
  it("maps other errors to unknown with the API detail", () => {
    const err = mapHttpError(422, { error: { message: "boom" } }, { label: "NIM" });
    expect(err?.code).toBe("unknown");
    expect(err?.message).toContain("boom");
  });
});

describe("buildChatBody", () => {
  it("uses the requested max tokens field and clamps it", () => {
    const b = buildChatBody(userReq({ maxTokens: 999999 }), {
      provider: "openai",
      maxTokensField: "max_completion_tokens",
    });
    expect(b.max_completion_tokens).toBe(16384);
    expect(b.max_tokens).toBeUndefined();
  });

  it("applies the param policy to temperature, keeping it for gpt-4o and omitting it for o3", () => {
    expect(
      buildChatBody(userReq({ temperature: 0.3 }), { provider: "openai" }).temperature
    ).toBe(0.3);
    expect(
      buildChatBody(
        { model: "o3-mini", messages: [{ role: "user", content: "hi" }], temperature: 0.3 },
        { provider: "openai" }
      ).temperature
    ).toBeUndefined();
  });

  it("sets stream_options for stream with includeUsage", () => {
    const b = buildChatBody(userReq(), {
      provider: "openai",
      stream: true,
      includeUsage: true,
    });
    expect(b.stream).toBe(true);
    expect(b.stream_options).toEqual({ include_usage: true });
  });

  it("converts tools to function format with tool_choice auto", () => {
    const b = buildChatBody(
      userReq({ tools: [{ name: "f", description: "d", parameters: {} }] }),
      { provider: "openai" }
    );
    expect(Array.isArray(b.tools)).toBe(true);
    expect(b.tool_choice).toBe("auto");
  });
});

describe("parseOpenAIChatMessage with malformed tool calls", () => {
  const msg = (tool_calls: unknown[]) =>
    parseOpenAIChatMessage({ content: "hi", tool_calls } as never);

  it("drops a tool call without function and keeps the reply", () => {
    const r = msg([{ type: "function", id: "a" }]);
    expect(r.content).toBe("hi");
    expect(r.toolCalls).toBeUndefined();
  });

  it("drops a tool call without a name", () => {
    const r = msg([{ type: "function", id: "a", function: { arguments: "{}" } }]);
    expect(r.toolCalls).toBeUndefined();
  });

  it("generates an id when missing so the agent loop can close", () => {
    const r = msg([{ type: "function", function: { name: "read", arguments: "{}" } }]);
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls?.[0].name).toBe("read");
    expect(r.toolCalls?.[0].id).toMatch(/^call_/);
  });

  it("treats missing arguments as {} instead of failing JSON.parse", () => {
    const r = msg([{ type: "function", id: "x", function: { name: "read" } }]);
    expect(r.toolCalls?.[0].arguments).toEqual({});
  });

  it("blocks the batch and flags invalid arguments", () => {
    const r = msg([
      { type: "function", id: "x", function: { name: "read", arguments: "{not json" } },
    ]);
    expect(r.toolCalls).toBeUndefined();
    expect(r.invalidToolCalls).toBe(true);
  });

  it("does not run part of a mixed batch", () => {
    const r = msg([
      { type: "function", id: "a", function: {} },
      { type: "function", id: "b", function: { name: "ok", arguments: '{"n":1}' } },
    ]);
    expect(r.toolCalls).toBeUndefined();
    expect(r.invalidToolCalls).toBe(true);
  });

  it("ignores entries that are not of type function", () => {
    const r = msg([{ type: "other", function: { name: "read", arguments: "{}" } }]);
    expect(r.toolCalls).toBeUndefined();
  });
});

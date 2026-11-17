import { afterEach, describe, expect, it } from "vitest";
import { __setRequestUrl } from "obsidian";
import { isLocalAddress, formatSearchResults, toolWebFetch, toolWebSearch, allowedUrl } from "../src/agent/web";
import { decideToolGate } from "../src/agent/permissions";
import { getToolDefinition } from "../src/agent/toolSchemas";
import { agentActivitySpec } from "../src/core/helpers";
import type { ToolContext } from "../src/agent/types";

const ctx = (tavily = ""): ToolContext =>
  ({ app: {}, vectorIndex: null, embed: { openaiApiKey: "", openrouterApiKey: "" }, web: { tavilyApiKey: tavily } }) as unknown as ToolContext;

afterEach(() => __setRequestUrl(null));

describe("local addresses are refused", () => {
  it("rejects loopback, home network, link-local, CGNAT, .local and local IPv6", () => {
    for (const h of ["localhost", "app.localhost", "127.0.0.1", "10.0.0.5", "172.16.1.1", "172.31.255.1", "192.168.0.10", "169.254.1.1", "100.64.0.1", "0.0.0.0", "nas.local", "[::1]", "fe80::1", "fd12::3"]) {
      expect(isLocalAddress(h), h).toBe(true);
    }
  });

  it("allows public addresses, including names starting with fc or fd", () => {
    for (const h of ["example.com", "8.8.8.8", "172.32.0.1", "fdroid.org", "fcbarcelona.com", "100.128.0.1"]) {
      expect(isLocalAddress(h), h).toBe(false);
    }
  });

  it("allowedUrl accepts only public http(s)", () => {
    expect(allowedUrl("https://example.com/a?b=1").hostname).toBe("example.com");
    expect(() => allowedUrl("ftp://example.com")).toThrow(/http and https/);
    expect(() => allowedUrl("http://localhost:11434/api/tags")).toThrow(/local address/);
    expect(() => allowedUrl("http://192.168.1.1/admin")).toThrow(/local address/);
    expect(() => allowedUrl("not a url")).toThrow(/valid URL/);
  });
});

describe("web_fetch", () => {
  it("turns HTML into text with the title and URL on top", async () => {
    __setRequestUrl(async () => ({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      text: "<html><head><title>A page</title><script>x()</script></head><body><p>Hello <b>world</b></p></body></html>",
    }));
    const out = await toolWebFetch(ctx(), { url: "https://example.com/p" });
    expect(out).toContain("Title: A page");
    expect(out).toContain("URL: https://example.com/p");
    expect(out).toContain("Hello world");
    expect(out).not.toContain("x()");
  });

  it("accepts JSON and text but not PDF", async () => {
    __setRequestUrl(async () => ({ status: 200, headers: { "content-type": "application/json" }, text: '{"a":1}' }));
    expect(await toolWebFetch(ctx(), { url: "https://api.example.com/x" })).toContain('{"a":1}');
    __setRequestUrl(async () => ({ status: 200, headers: { "content-type": "application/pdf" }, text: "%PDF" }));
    await expect(toolWebFetch(ctx(), { url: "https://example.com/a.pdf" })).rejects.toThrow(/Not a text page/);
  });

  it("turns a page error into a tool error", async () => {
    __setRequestUrl(async () => ({ status: 404, headers: {}, text: "" }));
    await expect(toolWebFetch(ctx(), { url: "https://example.com/x" })).rejects.toThrow(/404/);
  });

  it("never sends a request to a local address", async () => {
    let sent = false;
    __setRequestUrl(async () => {
      sent = true;
      return { status: 200, headers: {}, text: "" };
    });
    await expect(toolWebFetch(ctx(), { url: "http://127.0.0.1:8080" })).rejects.toThrow(/local address/);
    expect(sent).toBe(false);
  });
});

describe("web_search (Tavily)", () => {
  it("asks for the key without sending a request when none is set", async () => {
    await expect(toolWebSearch(ctx(""), { query: "x" })).rejects.toThrow(/Tavily key/);
  });

  it("sends the query with the key and formats the results", async () => {
    let request: { url?: string; headers?: Record<string, string>; body?: string } = {};
    __setRequestUrl(async (o) => {
      request = o as typeof request;
      return {
        status: 200,
        json: {
          results: [
            { title: "Obsidian", url: "https://obsidian.md", content: "A second   brain" },
            { url: "https://help.obsidian.md" },
          ],
        },
      };
    });
    const out = await toolWebSearch(ctx("tvly-abc"), { query: "obsidian", maxResults: 50 });
    expect(request.url).toBe("https://api.tavily.com/search");
    expect(request.headers?.Authorization).toBe("Bearer tvly-abc");
    expect(JSON.parse(request.body ?? "{}")).toMatchObject({ query: "obsidian", max_results: 10, search_depth: "basic" });
    expect(out).toContain("1. Obsidian\n   https://obsidian.md\n   A second brain");
    expect(out).toContain("2. https://help.obsidian.md");
  });

  it("turns a refused key and plan limit into clear messages", async () => {
    __setRequestUrl(async () => ({ status: 401, json: {} }));
    await expect(toolWebSearch(ctx("k"), { query: "x" })).rejects.toThrow(/refused/);
    __setRequestUrl(async () => ({ status: 432, json: {} }));
    await expect(toolWebSearch(ctx("k"), { query: "x" })).rejects.toThrow(/1,000 searches/);
  });

  it("reports when there are no results", () => {
    expect(formatSearchResults("nothing", { results: [] })).toBe('No web results for "nothing".');
  });
});

describe("when web tools ask for approval", () => {
  const web = getToolDefinition("web_fetch")!;
  it("asks in Ask and Vault, and passes in YOLO or after approving all web calls", () => {
    expect(web.network).toBe(true);
    expect(decideToolGate(web, "ask", { approveAll: false })).toBe("confirm");
    expect(decideToolGate(web, "vault", { approveAll: false })).toBe("confirm");
    expect(decideToolGate(web, "yolo", { approveAll: false })).toBe("auto");
    expect(decideToolGate(web, "ask", { approveAll: false, approveAllWeb: true })).toBe("auto");
  });

  it("keeps approve-all for edits and approve-all for web separate", () => {
    const editTool = getToolDefinition("vault_edit")!;
    expect(decideToolGate(web, "ask", { approveAll: true })).toBe("confirm");
    expect(decideToolGate(web, "vault", { approveAll: true })).toBe("confirm");
    expect(decideToolGate(editTool, "ask", { approveAll: false, approveAllWeb: true })).toBe("confirm");
    expect(decideToolGate(editTool, "ask", { approveAll: true })).toBe("auto");
  });

  it("narrates the host instead of the full URL", () => {
    expect(agentActivitySpec("web_fetch", { url: "https://example.com/a/b?c=1" }).pendingText).toBe("Opening example.com");
    expect(agentActivitySpec("web_search", { query: "weather in sp" }).doneText).toBe('Searched the web for "weather in sp"');
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { __setRequestUrl } from "obsidian";
import { ehEnderecoLocal, formatarBusca, toolWebFetch, toolWebSearch, urlPermitida } from "../src/agent/web";
import { decideToolGate } from "../src/agent/permissions";
import { getToolDefinition } from "../src/agent/toolSchemas";
import { agentActivitySpec } from "../src/core/helpers";
import type { ToolContext } from "../src/agent/types";

const ctx = (tavily = ""): ToolContext =>
  ({ app: {}, vectorIndex: null, embed: { openaiApiKey: "", openrouterApiKey: "" }, web: { tavilyApiKey: tavily } }) as unknown as ToolContext;

afterEach(() => __setRequestUrl(null));

describe("endereço local é recusado", () => {
  it("loopback, rede de casa, link-local, CGNAT, .local e IPv6 local", () => {
    for (const h of ["localhost", "app.localhost", "127.0.0.1", "10.0.0.5", "172.16.1.1", "172.31.255.1", "192.168.0.10", "169.254.1.1", "100.64.0.1", "0.0.0.0", "nas.local", "[::1]", "fe80::1", "fd12::3"]) {
      expect(ehEnderecoLocal(h), h).toBe(true);
    }
  });

  it("endereço público passa — inclusive nome que começa com fc/fd", () => {
    for (const h of ["example.com", "8.8.8.8", "172.32.0.1", "fdroid.org", "fcbarcelona.com", "100.128.0.1"]) {
      expect(ehEnderecoLocal(h), h).toBe(false);
    }
  });

  it("urlPermitida: só http(s) público", () => {
    expect(urlPermitida("https://example.com/a?b=1").hostname).toBe("example.com");
    expect(() => urlPermitida("ftp://example.com")).toThrow(/http and https/);
    expect(() => urlPermitida("http://localhost:11434/api/tags")).toThrow(/local address/);
    expect(() => urlPermitida("http://192.168.1.1/admin")).toThrow(/local address/);
    expect(() => urlPermitida("não é url")).toThrow(/valid URL/);
  });
});

describe("web_fetch", () => {
  it("HTML vira texto, com título e URL no topo", async () => {
    __setRequestUrl(async () => ({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      text: "<html><head><title>Uma página</title><script>x()</script></head><body><p>Olá <b>mundo</b></p></body></html>",
    }));
    const out = await toolWebFetch(ctx(), { url: "https://example.com/p" });
    expect(out).toContain("Title: Uma página");
    expect(out).toContain("URL: https://example.com/p");
    expect(out).toContain("Olá mundo");
    expect(out).not.toContain("x()");
  });

  it("JSON e texto passam; PDF não", async () => {
    __setRequestUrl(async () => ({ status: 200, headers: { "content-type": "application/json" }, text: '{"a":1}' }));
    expect(await toolWebFetch(ctx(), { url: "https://api.example.com/x" })).toContain('{"a":1}');
    __setRequestUrl(async () => ({ status: 200, headers: { "content-type": "application/pdf" }, text: "%PDF" }));
    await expect(toolWebFetch(ctx(), { url: "https://example.com/a.pdf" })).rejects.toThrow(/Not a text page/);
  });

  it("erro da página vira erro da tool", async () => {
    __setRequestUrl(async () => ({ status: 404, headers: {}, text: "" }));
    await expect(toolWebFetch(ctx(), { url: "https://example.com/x" })).rejects.toThrow(/404/);
  });

  it("endereço local nem chega a sair", async () => {
    let saiu = false;
    __setRequestUrl(async () => {
      saiu = true;
      return { status: 200, headers: {}, text: "" };
    });
    await expect(toolWebFetch(ctx(), { url: "http://127.0.0.1:8080" })).rejects.toThrow(/local address/);
    expect(saiu).toBe(false);
  });
});

describe("web_search (Tavily)", () => {
  it("sem chave: pede a chave, sem sair", async () => {
    await expect(toolWebSearch(ctx(""), { query: "x" })).rejects.toThrow(/Tavily key/);
  });

  it("manda a consulta com a chave e formata os resultados", async () => {
    let pedido: { url?: string; headers?: Record<string, string>; body?: string } = {};
    __setRequestUrl(async (o) => {
      pedido = o as typeof pedido;
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
    expect(pedido.url).toBe("https://api.tavily.com/search");
    expect(pedido.headers?.Authorization).toBe("Bearer tvly-abc");
    expect(JSON.parse(pedido.body ?? "{}")).toMatchObject({ query: "obsidian", max_results: 10, search_depth: "basic" });
    expect(out).toContain("1. Obsidian\n   https://obsidian.md\n   A second brain");
    expect(out).toContain("2. https://help.obsidian.md");
  });

  it("chave recusada e limite do plano viram frases claras", async () => {
    __setRequestUrl(async () => ({ status: 401, json: {} }));
    await expect(toolWebSearch(ctx("k"), { query: "x" })).rejects.toThrow(/refused/);
    __setRequestUrl(async () => ({ status: 432, json: {} }));
    await expect(toolWebSearch(ctx("k"), { query: "x" })).rejects.toThrow(/1,000 searches/);
  });

  it("sem resultados", () => {
    expect(formatarBusca("nada", { results: [] })).toBe('No web results for "nada".');
  });
});

describe("quando a web pergunta", () => {
  const web = getToolDefinition("web_fetch")!;
  it("Ask e Vault perguntam; passam o YOLO e o 'aprovar todas' dado à web", () => {
    expect(web.network).toBe(true);
    expect(decideToolGate(web, "ask", { approveAll: false })).toBe("confirm");
    expect(decideToolGate(web, "vault", { approveAll: false })).toBe("confirm");
    expect(decideToolGate(web, "yolo", { approveAll: false })).toBe("auto");
    expect(decideToolGate(web, "ask", { approveAll: false, approveAllWeb: true })).toBe("auto");
  });

  it("o 'aprovar todas' de uma edição não libera a web, nem o da web libera edição", () => {
    const editar = getToolDefinition("vault_edit")!;
    expect(decideToolGate(web, "ask", { approveAll: true })).toBe("confirm");
    expect(decideToolGate(web, "vault", { approveAll: true })).toBe("confirm");
    expect(decideToolGate(editar, "ask", { approveAll: false, approveAllWeb: true })).toBe("confirm");
    expect(decideToolGate(editar, "ask", { approveAll: true })).toBe("auto");
  });

  it("a narração mostra o host, não a URL inteira", () => {
    expect(agentActivitySpec("web_fetch", { url: "https://example.com/a/b?c=1" }).pendingText).toBe("Opening example.com");
    expect(agentActivitySpec("web_search", { query: "clima em sp" }).doneText).toBe('Searched the web for "clima em sp"');
  });
});

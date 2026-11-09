import { requestUrl } from "obsidian";
import { htmlTitle, htmlToText } from "../ui/attachSources";
import type { ToolContext } from "./types";

const MAX_PAGINA = 20_000;

const TAVILY_SEARCH = "https://api.tavily.com/search";

export function ehEnderecoLocal(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) {
    return true;
  }
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {

    return h.includes(":");
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) 
  );
}

export function urlPermitida(entrada: string): URL {
  let u: URL;
  try {
    u = new URL(entrada.trim());
  } catch {
    throw new Error(`Not a valid URL: ${entrada.slice(0, 120)}`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error(`Only http and https pages can be opened (got ${u.protocol}).`);
  }
  if (ehEnderecoLocal(u.hostname)) {
    throw new Error(`Refusing a local address (${u.hostname}): the agent only opens public web pages.`);
  }
  return u;
}

interface FetchArgs {
  url: string;
}

export async function toolWebFetch(_ctx: ToolContext, args: FetchArgs): Promise<string> {
  const u = urlPermitida(String(args.url ?? ""));
  const res = await requestUrl({
    url: u.toString(),
    method: "GET",
    headers: { Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" },
    throw: false,
  });
  if (res.status >= 400) {
    throw new Error(`The page answered ${res.status}.`);
  }
  const tipo = String(res.headers?.["content-type"] ?? res.headers?.["Content-Type"] ?? "").toLowerCase();
  const corpo = res.text ?? "";
  let titulo: string | null = null;
  let texto: string;
  if (tipo.includes("html") || (!tipo && /<html|<body|<title/i.test(corpo))) {
    titulo = htmlTitle(corpo);
    texto = htmlToText(corpo, MAX_PAGINA);
  } else if (tipo.startsWith("text/") || tipo.includes("json") || tipo.includes("xml") || !tipo) {
    texto = corpo.length > MAX_PAGINA ? `${corpo.slice(0, MAX_PAGINA)}\n\n[…]` : corpo;
  } else {
    throw new Error(`Not a text page (${tipo.split(";")[0]}) — only HTML and text can be read.`);
  }
  if (!texto.trim()) throw new Error("The page has no readable text.");
  return [`Title: ${titulo ?? "(none)"}`, `URL: ${u.toString()}`, "", texto].join("\n");
}

interface SearchArgs {
  query: string;
  maxResults?: number;
}

interface ResultadoTavily {
  title?: unknown;
  url?: unknown;
  content?: unknown;
}

export function formatarBusca(query: string, json: unknown): string {
  const lista = (json as { results?: unknown } | null)?.results;
  const resultados = Array.isArray(lista) ? (lista as ResultadoTavily[]) : [];
  const linhas = resultados
    .filter((r) => typeof r?.url === "string")
    .map((r, i) => {
      const titulo = typeof r.title === "string" && r.title.trim() ? r.title.trim() : String(r.url);
      const trecho = typeof r.content === "string" ? r.content.replace(/\s+/g, " ").trim().slice(0, 600) : "";
      return `${i + 1}. ${titulo}\n   ${String(r.url)}${trecho ? `\n   ${trecho}` : ""}`;
    });
  if (linhas.length === 0) return `No web results for "${query}".`;
  return `Web search — ${linhas.length} result(s) for "${query}":\n\n${linhas.join("\n\n")}\n\nOpen a result with web_fetch before relying on it, and cite the URLs you use.`;
}

export async function toolWebSearch(ctx: ToolContext, args: SearchArgs): Promise<string> {
  const query = String(args.query ?? "").trim();
  if (!query) throw new Error("Empty 'query' parameter.");
  const chave = ctx.web?.tavilyApiKey?.trim() ?? "";
  if (!chave) throw new Error("Web search needs a Tavily key (Settings › Agent).");
  const max = Math.min(Math.max(Math.round(Number(args.maxResults) || 5), 1), 10);
  const res = await requestUrl({
    url: TAVILY_SEARCH,
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: max, search_depth: "basic" }),
    throw: false,
  });
  if (res.status === 401 || res.status === 403) throw new Error("The Tavily key was refused.");
  if (res.status === 429 || res.status === 432 || res.status === 433) {
    throw new Error("Tavily's limit for this key was reached (the free plan has 1,000 searches a month).");
  }
  if (res.status >= 400) throw new Error(`Tavily answered ${res.status}.`);
  return formatarBusca(query, res.json);
}

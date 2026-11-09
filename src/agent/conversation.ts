// src/agent/conversation.ts
// Montagem do SYSTEM PROMPT e do history — antes copiada em 4 lugares do
// CorvusApp (streamReply / runAgentTurn / regenerate / continue). Centralizado
// aqui, puro e testável.

import type { ProviderMessage, MessageAttachment } from "../providers/base";
import type { AIToolStep } from "./types";

// ── System prompt ──────────────────────────────────────────

export interface ChatSystemParts {
  /** Persona custom do chat (sessionPersona). Se truthy, SUBSTITUI o base. */
  persona?: string;
  /** System prompt padrão (t.systemPrompt.base). */
  base: string;
  /** Sufixo do modo Vault Q&A (t.systemPrompt.vaultQaSuffix). */
  vaultSuffix?: string;
  /** Bloco de notas recuperadas (RAG). Só entra se não-vazio. */
  vaultBlock?: string;
  /** Bloco de notas anexadas pelo user. */
  noteBlock?: string;
  /** Instrução de estilo de resposta (Conciso/Explicativo/etc). Anexada ao
   *  head sem substituir a persona/base. Vazio = sem efeito. */
  styleInstruction?: string;
  /**
   * Instruções do PROJETO em que a conversa nasceu.
   *
   * Somam, não substituem — ao contrário da persona. A diferença não é
   * detalhe: persona é "seja outro assistente"; instrução de projeto é "neste
   * assunto, faça assim". Trocar o prompt base por ela levaria junto as regras
   * do app (o que o agente pode mexer, como citar nota, o idioma) — e ninguém
   * que escreveu "responda em tópicos curtos" pediu isso.
   */
  instructions?: string;
  /** Instruções globais do AGENT.md (lidas do vault a cada turno). */
  agentMd?: string;
}

/**
 * O bloco de instruções globais do AGENT.md (lido a cada turno).
 */
export function blocoAgentMd(conteudo?: string): string {
  return conteudo && conteudo.trim() ? "\n\n[AGENT.md]\n" + conteudo.trim() : "";
}

/**
 * O que as instruções de um projeto SOMAM ao system prompt.
 *
 * Função própria, e não uma linha dentro do montador, porque tem mais alguém
 * que precisa do texto exato: o cartão de projeto, que mostra quantos tokens
 * de entrada o projeto custa ao abrir uma conversa. Duas contas pro mesmo
 * texto é como o número do cartão passaria a mentir sem ninguém ver.
 */
export function blocoDeInstrucoes(instrucoes?: string): string {
  return instrucoes && instrucoes.trim() ? "\n\n" + instrucoes.trim() : "";
}

/**
 * O bloco das NOTAS anexadas, como ele vai no system prompt (o modelo "vê" o
 * conteúdo delas). UM montador só: o envio (chatEngine) e o cartão de projeto
 * usam este — pelo mesmo motivo de `blocoDeInstrucoes`.
 */
export function blocoDeNotasAnexadas(
  notas: readonly { path: string; content: string }[]
): string {
  if (!notas.length) return "";
  return (
    "\n\n[Notas anexadas pelo usuário]\n\n" +
    notas.map((n) => `### ${n.path}\n\n${n.content}`).join("\n\n---\n\n")
  );
}

/** Monta o system prompt do CHAT/Vault-QA: (persona || base) + agentMd + proj + style + vault + notes. */
export function buildChatSystemPrompt(p: ChatSystemParts): string {
  const head = (p.persona && p.persona.trim()) || p.base;
  const agentMd = blocoAgentMd(p.agentMd);
  const proj = blocoDeInstrucoes(p.instructions);
  const style =
    p.styleInstruction && p.styleInstruction.trim()
      ? "\n\n" + p.styleInstruction.trim()
      : "";
  const vault =
    p.vaultBlock && p.vaultBlock.length > 0
      ? (p.vaultSuffix ?? "") + p.vaultBlock
      : "";
  return head + agentMd + proj + style + vault + (p.noteBlock ?? "");
}

/**
 * Monta o system prompt do AGENT: persona é PREPENDIDA (não substitui).
 *
 * O bloco de notas é opcional e entra no fim, com o MESMO sufixo que o chat
 * usa — é o texto que explica pro modelo o que aqueles trechos são. Dois
 * jeitos de apresentar a mesma coisa dariam ao agente uma leitura diferente
 * do vault sem ninguém ter decidido isso.
 */
export function buildAgentSystemPrompt(
  persona: string | undefined,
  agentPrompt: string,
  vault?: { suffix?: string; block?: string },
  /** Instruções do projeto — depois do prompt do agente, antes das notas: as
   *  regras da casa continuam valendo, e o que o projeto pede vem por cima. */
  instructions?: string,
  /** Instruções globais do AGENT.md (lido a cada turno). */
  agentMd?: string
): string {
  const p = persona && persona.trim();
  const amd = blocoAgentMd(agentMd);
  const proj = instructions && instructions.trim();
  const notas =
    vault?.block && vault.block.length > 0
      ? (vault.suffix ?? "") + vault.block
      : "";
  return (
    (p ? p + "\n\n" : "") +
    agentPrompt +
    amd +
    (proj ? "\n\n" + proj : "") +
    notas
  );
}

// ── History (store → provider) ─────────────────────────────

/** Forma mínima de uma mensagem do store que vira mensagem de provider.
 *  content é opcional pois o store tem variantes sem ele (ai-options) — elas
 *  são filtradas fora de qualquer jeito. */
export interface StoreMessageLike {
  type: string;
  content?: string;
  isError?: boolean;
  /** Ações do agent (Agent mode) — reconstruídas no history pra continuidade. */
  agentSteps?: AIToolStep[];
}

/** Keep completed actions even when the final provider response failed. */
export function keepConversationMessage(m: StoreMessageLike): boolean {
  return m.type === "user" ||
    (m.type === "ai-response" && (!m.isError || Boolean(m.agentSteps?.length)));
}

// ── Flatten de agentSteps → texto (modos SEM tools) ────────
// Mandar `tool_calls`/`tool` num request que NÃO declara `tools` quebra em
// vários providers: Anthropic responde 400 ("tool_use/tool_result exigem tools
// definidas"); Gemini-compat / OpenRouter / NIM podem rejeitar. Então, fora do
// Agent mode, as ações do agent viram um BLOCO DE TEXTO no assistant — o modelo
// mantém a MEMÓRIA do que fez e funciona em TODO provider e modo. v0.1.161

function truncateInline(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max).trimEnd() + "…" : flat;
}

/** Arg mais significativo de um step pra rotular a ação no texto. */
function stepKeyArg(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  for (const k of ["path", "from", "to", "folder", "query", "note", "title"]) {
    const v = args[k];
    if (typeof v === "string" && v) return v;
  }
  return "";
}

function summarizeStepLine(s: AIToolStep, i: number): string {
  const arg = stepKeyArg(s.arguments);
  const head = arg ? `${s.name}(${truncateInline(arg, 80)})` : s.name;
  const status = s.ok ? "ok" : "ERRO";
  const excerpt = s.result ? ` — ${truncateInline(s.result, 160)}` : "";
  return `${i + 1}. ${head} → ${status}${excerpt}`;
}

/**
 * ai-response COM agentSteps → um único assistant em TEXTO que preserva a
 * memória do que o agent fez. Usado fora do Agent mode (request sem `tools`),
 * onde mandar tool_calls wire-level quebraria o provider. Puro/testável.
 */
export function flattenAgentResponse(
  finalText: string,
  steps: AIToolStep[]
): string {
  const lines = steps.map((s, i) => summarizeStepLine(s, i));
  const block =
    "〔agent memory — actions already taken in this conversation:\n" +
    lines.join("\n") +
    "〕";
  const t = (finalText ?? "").trim();
  return t ? `${t}\n\n${block}` : block;
}

/**
 * Converte mensagens do store em ProviderMessage[] mandadas ao LLM:
 *   - mantém só `user` e `ai-response` SEM erro (isError não polui o contexto)
 *   - a ÚLTIMA user-msg recebe os attachments multimodais (quando passados)
 *   - ai-response COM agentSteps (Agent mode) recupera a memória do agent:
 *       · `toolMode=true`  (Agent mode — request declara tools): EXPANDE pro
 *         shape wire — assistant(tool_calls) + tool(results) + assistant(texto)
 *         — replay PRECISO, cross-provider. v0.1.160
 *       · `toolMode=false` (chat / vault-qa / regenerate / continue, ou
 *         qualquer provider sem tools na request): ACHATA num assistant de
 *         TEXTO. Portável em todo provider — não há tool_calls num request sem
 *         `tools` pra quebrar Anthropic/Gemini-compat. v0.1.161
 */
export function storeMessagesToProvider(
  messages: StoreMessageLike[],
  lastUserAttachments?: MessageAttachment[],
  toolMode = false
): ProviderMessage[] {
  const usable = messages.filter(keepConversationMessage);
  const out: ProviderMessage[] = [];
  usable.forEach((m, idx) => {
    if (m.type === "ai-response" && m.agentSteps && m.agentSteps.length > 0) {
      if (toolMode) {
        // Agent mode: assistant(tool_calls) + tool results + resposta final.
        out.push({
          role: "assistant",
          content: "",
          toolCalls: m.agentSteps.map((s) => ({
            id: s.id,
            name: s.name,
            arguments: s.arguments,
          })),
        });
        for (const s of m.agentSteps) {
          // v0.1.228: garante content não-vazio (providers como Anthropic
          // rejeitam tool_result vazio) e sinaliza falha no próprio texto —
          // o shape do provider não tem flag isError pra role="tool".
          const body = s.result?.trim() ? s.result : "(sem saída)";
          out.push({
            role: "tool",
            toolCallId: s.id,
            content: s.ok ? body : `ERRO: ${body}`,
          });
        }
        if (m.content && !m.isError) out.push({ role: "assistant", content: m.content });
      } else {
        // Qualquer outro modo/provider: ações viram texto (memória portável).
        out.push({
          role: "assistant",
          content: flattenAgentResponse(m.isError ? "" : m.content ?? "", m.agentSteps),
        });
      }
      return;
    }
    const base: ProviderMessage = {
      role: m.type === "user" ? "user" : "assistant",
      content: m.content ?? "",
    };
    const isLastUser = m.type === "user" && usable.slice(idx + 1).every((next) => next.isError);
    if (isLastUser && lastUserAttachments && lastUserAttachments.length > 0) {
      out.push({ ...base, attachments: lastUserAttachments });
    } else {
      out.push(base);
    }
  });
  return out;
}

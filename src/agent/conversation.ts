import type { ProviderMessage, MessageAttachment } from "../providers/base";
import type { AIToolStep } from "./types";

export interface ChatSystemParts {

  persona?: string;

  base: string;

  vaultSuffix?: string;

  vaultBlock?: string;

  noteBlock?: string;

  styleInstruction?: string;

  instructions?: string;

  agentMd?: string;
}

export function blocoAgentMd(conteudo?: string): string {
  return conteudo && conteudo.trim() ? "\n\n[AGENT.md]\n" + conteudo.trim() : "";
}

export function blocoDeInstrucoes(instrucoes?: string): string {
  return instrucoes && instrucoes.trim() ? "\n\n" + instrucoes.trim() : "";
}

export function blocoDeNotasAnexadas(
  notas: readonly { path: string; content: string }[]
): string {
  if (!notas.length) return "";
  return (
    "\n\n[Notes attached by user]\n\n" +
    notas.map((n) => `### ${n.path}\n\n${n.content}`).join("\n\n---\n\n")
  );
}

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

export function buildAgentSystemPrompt(
  persona: string | undefined,
  agentPrompt: string,
  vault?: { suffix?: string; block?: string },

  instructions?: string,

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

export interface StoreMessageLike {
  type: string;
  content?: string;
  isError?: boolean;

  agentSteps?: AIToolStep[];

  steer?: string;

  trace?: ReadonlyArray<{ kind: string; text?: string }>;
}

function steersByResponse(messages: StoreMessageLike[]): Map<StoreMessageLike, string> {
  const out = new Map<StoreMessageLike, string>();
  let pending: string[] = [];
  for (const m of messages) {
    if (m.type === "ai-comment" && m.steer !== undefined) {
      pending.push(m.steer);
    } else if (m.type === "user") {
      pending = [];
    } else if (m.type === "ai-response") {
      const steers = pending.length > 0
        ? pending
        : (m.trace ?? []).flatMap((i) => (i.kind === "steer" && i.text ? [i.text] : []));
      if (steers.length > 0) out.set(m, steers.join("\n\n"));
      pending = [];
    }
  }
  return out;
}

export function keepConversationMessage(m: StoreMessageLike): boolean {
  return m.type === "user" ||
    (m.type === "ai-response" && (!m.isError || Boolean(m.agentSteps?.length)));
}

function truncateInline(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max).trimEnd() + "…" : flat;
}

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
  const status = s.ok ? "ok" : "ERROR";
  const excerpt = s.result ? ` — ${truncateInline(s.result, 160)}` : "";
  return `${i + 1}. ${head} → ${status}${excerpt}`;
}

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

export function storeMessagesToProvider(
  messages: StoreMessageLike[],
  lastUserAttachments?: MessageAttachment[],
  toolMode = false
): ProviderMessage[] {
  const steers = steersByResponse(messages);
  const usable = messages.filter(keepConversationMessage);
  const out: ProviderMessage[] = [];
  usable.forEach((m, idx) => {
    const steer = steers.get(m);
    if (m.type === "ai-response" && m.agentSteps && m.agentSteps.length > 0) {
      if (toolMode) {

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

          const body = s.result?.trim() ? s.result : "(no output)";
          out.push({
            role: "tool",
            toolCallId: s.id,
            content: s.ok ? body : `ERROR: ${body}`,
          });
        }
        if (steer) out.push({ role: "user", content: steer });
        if (m.content && !m.isError) out.push({ role: "assistant", content: m.content });
      } else {
        if (steer) out.push({ role: "user", content: steer });
        out.push({
          role: "assistant",
          content: flattenAgentResponse(m.isError ? "" : m.content ?? "", m.agentSteps),
        });
      }
      return;
    }
    if (steer) out.push({ role: "user", content: steer });
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

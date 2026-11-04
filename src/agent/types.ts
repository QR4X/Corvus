// src/agent/types.ts
// Contratos do Agent Mode — tipos compartilhados entre tools, provider e UI.
//
// Conceito: o LLM age como CONTROLADOR e o nosso código é o EXECUTOR.
// 1. User: "crie uma nota sobre X"
// 2. Provider devolve uma tool_call: { name: "vault_create", arguments: { ... } }
// 3. Nosso código executa a tool, devolve o resultado
// 4. Provider continua até dar a resposta de texto final

import type { App } from "obsidian";
import type { VectorIndex } from "../rag/vectorIndex";

/**
 * Uma ação executada pelo agent (tool call + resultado). Persistida no chat pra
 * dar CONTINUIDADE: ao reabrir o chat e mandar nova mensagem, o agent recebe de
 * volta o que ele já fez (assistant tool_call + tool result reconstruídos no
 * history) — cada chat mantém sua própria janela de contexto. v0.1.160
 */
export interface AIToolStep {
  /** id da tool_call (conecta o result ao call). */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Resultado da tool (truncado pra não inchar o .md). */
  result: string;
  /** Falhou? (result carrega a mensagem de erro). */
  ok: boolean;
}

/** Quanto controle o user dá ao agent (as regras moram em permissions.ts).
 *  - ask: confirma cada mudança no vault antes de executar
 *  - vault: cria, edita e move sem perguntar; apagar pergunta
 *  - yolo: tudo sem perguntar, apagar inclusive — quando o apagado vai pra
 *          uma lixeira; com "apagar de vez" no Obsidian, apagar pergunta
 *
 * Toda mudança do agente tem Undo na conversa durante a sessão (undo.ts). */
export type PermissionLevel = "ask" | "vault" | "yolo";

/** Contexto passado aos executores de tools. Além do `app`, carrega o que
 *  tools "inteligentes" (ex: vault_search) precisam: o índice RAG + credenciais
 *  de embedding. Tools simples (list/read/...) usam só `ctx.app`. */
export interface ToolContext {
  app: App;
  /** Índice vetorial RAG — null se ainda não foi indexado. */
  vectorIndex: VectorIndex | null;
  /** Pastas do PRÓPRIO app (chatsPath, ragIndexPath) quando NÃO são ocultas —
   *  o agente não pode tocar nelas nem quando visíveis (histórico de conversa,
   *  índice RAG). Guardadas aqui por caminho configurado, não por literal. */
  appDataPaths?: readonly string[];
  /** Credenciais pra busca semântica (embedQuery / hybridSearch). */
  embed: {
    openaiApiKey: string;
    openrouterApiKey: string;
    geminiApiKey?: string;
    nimApiKey?: string;
    ollamaEndpoint?: string;
  };
  /** As ferramentas de web (agent/web.ts): a chave da busca. */
  web?: { tavilyApiKey: string };
}

/** Definição de uma ferramenta — vai pro `tools` array do provider request. */
export interface ToolDefinition {
  /** Nome usado pelo LLM (snake_case, igual function calling do OpenAI). */
  name: string;
  /** Descrição em PT-BR pro LLM entender quando usar. */
  description: string;
  /** Parâmetros aceitos — JSON Schema (subset usado pelos providers). */
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: "string" | "number" | "boolean" | "array" | "object";
        description: string;
        items?: { type: string };
      }
    >;
    required: string[];
  };
  /** true = pode mudar o vault (write/delete/move). Usado pra permissão. */
  destructive: boolean;
  /** true = apagar. Pergunta sempre, exceto no YOLO com o apagado indo pra
   *  uma lixeira (ver decideToolGate). */
  irreversible?: boolean;
  /** true = sai pra internet (agent/web.ts). Pergunta no Ask e no Vault —
   *  a URL é por onde uma instrução plantada numa nota vazaria dado. */
  network?: boolean;
}

/** Tool call vinda do provider — agent quer rodar uma tool. */
export interface ToolCall {
  /** ID único da chamada (volta como tool_call_id no resultado). */
  id: string;
  /** Nome da tool (tem que matchar uma das ToolDefinition). */
  name: string;
  /** Argumentos parseados do JSON string que o LLM produziu. */
  arguments: Record<string, unknown>;
}

/** Resultado da execução de uma tool — volta pro provider no próximo turn. */
export interface ToolResult {
  toolCallId: string;
  /** Conteúdo a ser apresentado pro LLM como observação. */
  content: string;
  /** true se a tool falhou (LLM ajusta tentativa seguinte). */
  isError?: boolean;
}

/** Status de uma execução de tool — usado pra renderizar feedback na UI. */
export interface ToolExecution {
  toolCall: ToolCall;
  status: "pending" | "approved" | "denied" | "running" | "done" | "error";
  result?: ToolResult;
  /** Texto curto pra mostrar como ai-comment ("📄 Criando: foo.md"). */
  label: string;
}

/** Permissão computada pra uma tool específica + nível atual. */
export interface PermissionDecision {
  /** true = executa direto, false = mostra ConfirmationModal antes. */
  autoApprove: boolean;
}

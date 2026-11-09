import type { Provider, ProviderMessage } from "../providers/base";
import { lerObjeto, lerOpcoes, lerPergunta } from "./parse";
import { tr } from "../i18n/tr";

export interface TurnoAssistente {
  quem: "pessoa" | "assistente";
  texto: string;
}

export interface PedidoAssistente {
  provider: Provider;
  apiKey: string;
  model: string;

  sistema: string;

  turnos: TurnoAssistente[];
}

export interface RetornoAssistente {
  pergunta?: string;

  opcoes?: string[];

  bruto?: Record<string, unknown>;

  erro?: string;
}

export async function pedirAjuda(
  p: PedidoAssistente
): Promise<RetornoAssistente> {
  const messages: ProviderMessage[] = [
    { role: "system", content: p.sistema },
    ...p.turnos.map((t): ProviderMessage => ({
      role: t.quem === "pessoa" ? "user" : "assistant",
      content: t.texto,
    })),
  ];

  let resposta;
  try {
    resposta = await p.provider.chat(
      {
        model: p.model,
        messages,
        maxTokens: 1200,

        temperature: 0.4,
      },
      p.apiKey
    );
  } catch (e) {
    return {
      erro: (e as Error).message || tr("The assistant could not answer."),
    };
  }

  const obj = lerObjeto(resposta.content ?? "");
  if (!obj)

    return {
      erro: tr(
        "The assistant answered in prose instead of the expected format. A stronger model usually fixes it."
      ),
    };

  const pergunta = lerPergunta(obj);
  if (pergunta) return { pergunta, opcoes: lerOpcoes(obj) };

  const bruto = obj.draft;
  if (bruto && typeof bruto === "object" && !Array.isArray(bruto))
    return { bruto: bruto as Record<string, unknown> };

  return { bruto: obj };
}

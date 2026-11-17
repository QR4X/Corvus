import type { Provider, ProviderMessage } from "../providers/base";
import { parseObject, parseOptions, parseQuestion } from "./parse";
import { tr } from "../i18n/tr";

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

interface AssistantRequest {
  provider: Provider;
  apiKey: string;
  model: string;

  system: string;

  turns: AssistantTurn[];
}

interface AssistantReply {
  question?: string;

  options?: string[];

  raw?: Record<string, unknown>;

  error?: string;
}

export async function askAssistant(
  p: AssistantRequest
): Promise<AssistantReply> {
  const messages: ProviderMessage[] = [
    { role: "system", content: p.system },
    ...p.turns.map((t): ProviderMessage => ({
      role: t.role,
      content: t.text,
    })),
  ];

  let response;
  try {
    response = await p.provider.chat(
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
      error: (e as Error).message || tr("The assistant could not answer."),
    };
  }

  const obj = parseObject(response.content ?? "");
  if (!obj)

    return {
      error: tr(
        "The assistant answered in prose instead of the expected format. A stronger model usually fixes it."
      ),
    };

  const question = parseQuestion(obj);
  if (question) return { question, options: parseOptions(obj) };

  const draft = obj.draft;
  if (draft && typeof draft === "object" && !Array.isArray(draft))
    return { raw: draft as Record<string, unknown> };

  return { raw: obj };
}

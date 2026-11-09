import type { Provider, Usage } from "./base";
import { openaiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { openrouterProvider } from "./openrouter";
import { nimProvider } from "./nim";
import { ollamaProvider } from "./ollama";
import { anotarUso, conferirGasto } from "../usage/recorder";

export const providers: Record<string, Provider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  openrouter: openrouterProvider,
  nim: nimProvider,
  ollama: ollamaProvider,
};

function comRegistro(p: Provider): Provider {
  const w = Object.create(p) as Provider;
  w.chat = async (req, apiKey) => {

    conferirGasto(p.id, req.model);
    const res = await p.chat(req, apiKey);
    anotarUso(p.id, req.model, { r: 1, i: res.usage?.input ?? 0, o: res.usage?.output ?? 0 });
    return res;
  };
  w.streamChat = async (req, apiKey, onToken, onUsage, signal, onReasoning) => {
    conferirGasto(p.id, req.model);
    let aceito = false;
    let ultimo: Usage | null = null;
    try {
      const res = await p.streamChat(
        req,
        apiKey,
        (t) => {
          aceito = true;
          onToken(t);
        },
        (u) => {
          aceito = true;
          ultimo = u;
          onUsage?.(u);
        },
        signal,
        onReasoning &&
          ((d) => {
            aceito = true;
            onReasoning(d);
          })
      );
      aceito = true;
      ultimo ??= res.usage ?? null;
      return res;
    } finally {
      if (aceito) {
        anotarUso(p.id, req.model, { r: 1, i: ultimo?.input ?? 0, o: ultimo?.output ?? 0 });
      }
    }
  };
  return w;
}

const comUso = new WeakMap<Provider, Provider>();

export function getProvider(id: string): Provider {
  const p = providers[id] ?? openaiProvider;
  let w = comUso.get(p);
  if (!w) {
    w = comRegistro(p);
    comUso.set(p, w);
  }
  return w;
}

export {
  openaiProvider,
  anthropicProvider,
  geminiProvider,
  openrouterProvider,
  nimProvider,
  ollamaProvider,
};

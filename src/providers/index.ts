import type { Provider, Usage } from "./base";
import { openaiProvider } from "./openai";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { openrouterProvider } from "./openrouter";
import { nimProvider } from "./nim";
import { ollamaProvider } from "./ollama";
import { recordUsage, checkSpend } from "../usage/recorder";

export const providers: Record<string, Provider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  openrouter: openrouterProvider,
  nim: nimProvider,
  ollama: ollamaProvider,
};

function withUsageTracking(p: Provider): Provider {
  const w = Object.create(p) as Provider;
  w.chat = async (req, apiKey) => {

    checkSpend(p.id, req.model);
    const res = await p.chat(req, apiKey);
    recordUsage(p.id, req.model, { r: 1, i: res.usage?.input ?? 0, o: res.usage?.output ?? 0 });
    return res;
  };
  w.streamChat = async (req, apiKey, onToken, onUsage, signal, onReasoning) => {
    checkSpend(p.id, req.model);
    let accepted = false;
    let lastUsage: Usage | null = null;
    try {
      const res = await p.streamChat(
        req,
        apiKey,
        (t) => {
          accepted = true;
          onToken(t);
        },
        (u) => {
          accepted = true;
          lastUsage = u;
          onUsage?.(u);
        },
        signal,
        onReasoning &&
          ((d) => {
            accepted = true;
            onReasoning(d);
          })
      );
      accepted = true;
      lastUsage ??= res.usage ?? null;
      return res;
    } finally {
      if (accepted) {
        recordUsage(p.id, req.model, { r: 1, i: lastUsage?.input ?? 0, o: lastUsage?.output ?? 0 });
      }
    }
  };
  return w;
}

const tracked = new WeakMap<Provider, Provider>();

export function getProvider(id: string): Provider {
  const p = providers[id] ?? openaiProvider;
  let w = tracked.get(p);
  if (!w) {
    w = withUsageTracking(p);
    tracked.set(p, w);
  }
  return w;
}


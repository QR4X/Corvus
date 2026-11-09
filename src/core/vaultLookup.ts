import type CorvusPlugin from "../main";
import type { getTranslations } from "../i18n";
import { hybridSearch } from "../rag/hybrid";
import { effortToVaultLookup } from "./effort";

type AddMessage = (m: Record<string, unknown>) => string;
type UpdateActivity = (id: string, patch: Record<string, unknown>) => void;

export async function buscarContextoDoVault({
  plugin,
  t,
  effort,
  query,
  addMessage,
  updateActivity,
}: {
  plugin: CorvusPlugin;
  t: ReturnType<typeof getTranslations>;
  effort: string;
  query: string;
  addMessage: AddMessage;
  updateActivity: UpdateActivity;
}): Promise<string> {

  const { topK, excerptChars } = effortToVaultLookup(
    effort,
    plugin.settings.effortConfigs
  );

  const searchActivityId = addMessage({
    type: "ai-comment",
    content: "",
    activity: {
      phase: "pending",
      iconPending: "radar",
      iconDone: "check",
      pendingText: t.vault.searching(topK, effort),
      doneText: t.vault.searchDone,
    },
  });

  try {

    const hits = await hybridSearch({
      app: plugin.app,
      index: plugin.vectorIndex,
      creds: {
        openaiApiKey: plugin.settings.openaiApiKey,
        openrouterApiKey: plugin.settings.openrouterApiKey,
        geminiApiKey: plugin.settings.geminiApiKey,
        nimApiKey: plugin.settings.nimApiKey,
        ollamaEndpoint: plugin.settings.ollamaEndpoint,
      },
      query,
      topK,
      excerptChars,
    });

    if (hits.length === 0) {
      updateActivity(searchActivityId, {
        phase: "done",
        iconDone: "circle-slash",
        doneText: t.vault.notFound,
      });
      return "";
    }

    const bloco = hits
      .map((h) => {
        const base = h.path.replace(/\.md$/i, "").split("/").pop() ?? h.path;
        return `### [[${base}]]\n_(${h.path})_\n\n${h.text}`;
      })
      .join("\n\n---\n\n");

    const semanticUsed = hits.some((h) => h.via.includes("semantic"));
    const hasIndex = !!plugin.vectorIndex && plugin.vectorIndex.size > 0;
    updateActivity(searchActivityId, {
      phase: "done",
      doneText: semanticUsed
        ? t.vault.foundContextSemantic(hits.length)
        : hasIndex
          ? t.vault.foundContextKeywordFallback(hits.length)
          : t.vault.foundContextKeyword(hits.length),
    });
    return bloco;
  } catch (err) {
    console.error("[corvus] vault search failed:", err);
    updateActivity(searchActivityId, {
      phase: "failed",
      iconFailed: "x-circle",
      failedText: `${t.ai.errorPrefix} ${
        err instanceof Error ? err.message : t.ai.unknownError
      }`,
    });
    return "";
  }
}

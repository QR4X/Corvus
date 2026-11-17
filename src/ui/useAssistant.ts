import { useCallback, useMemo } from "react";
import type CorvusPlugin from "../main";
import { getProvider } from "../providers";
import {
  isFree,
  pickAssistant,
  unavailableReason,
} from "../assistant/model";
import {
  parseNotes,
  parseProject,
  parseSkill,
  parseText,
  type SuggestedProject,
  type SuggestedSkill,
} from "../assistant/parse";
import {
  promptDescription,
  promptInstructions,
  promptNotes,
  promptProject,
  promptSkill,
  MAX_VAULT_NOTES,
  type AssistantMode,
} from "../assistant/prompt";
import { askAssistant, type AssistantTurn } from "../assistant/run";
import { PROJECT_COLORS, PROJECT_ICONS } from "../projects";
import { SKILL_ICONS } from "../skills/skillFile";
import { ICON_CATALOG } from "../iconCatalog";
import { vaultNotes } from "./notePicker";
import { tr } from "../i18n/tr";
import { providerCredential } from "../core/providersMeta";

interface AssistantRound<T> {
  question?: string;

  options?: string[];
  error?: string;
  draft?: T;
}

function iconChoices(preferred: readonly string[]): string[] {
  const all = new Set(preferred);
  for (const c of ICON_CATALOG) for (const i of c.icons) all.add(i);
  return [...all];
}

export function useAssistant(plugin: CorvusPlugin) {
  const s = plugin.settings;

  const target = useMemo(
    () =>
      pickAssistant({
        assistantProvider: s.assistantProvider,
        assistantModel: s.assistantModel,
        favoriteModels: s.favoriteModels,
        activeModels: s.activeModels,
        freeModels: s.freeModels,
      }),
    [
      s.assistantProvider,
      s.assistantModel,
      s.favoriteModels,
      s.activeModels,
      s.freeModels,
    ]
  );

  const unavailable = useMemo(
    () =>
      unavailableReason(target, (id) =>
        !!providerCredential(plugin.settings, id).trim()
      ),
    [target, plugin]
  );

  const ask = useCallback(
    async (system: string, turns: AssistantTurn[]) => {
      if (!target) return { error: unavailable ?? tr("Assistant not available.") };
      return askAssistant({
        provider: getProvider(target.provider),
        apiKey: providerCredential(plugin.settings, target.provider),
        model: target.model,
        system,
        turns,
      });
    },
    [target, unavailable, plugin]
  );

  const askSkill = useCallback(
    async (
      mode: AssistantMode,
      turns: AssistantTurn[]
    ): Promise<AssistantRound<SuggestedSkill>> => {
      const allowed = iconChoices(SKILL_ICONS);
      const r = await ask(
        promptSkill(mode, allowed, PROJECT_COLORS),
        turns
      );
      if (r.error) return { error: r.error };
      if (r.question) return { question: r.question, options: r.options };
      const draft = parseSkill(
        r.raw ?? null,
        allowed,
        SKILL_ICONS[0],
        PROJECT_COLORS
      );
      return draft
        ? { draft }
        : {
            error: tr("The assistant did not write a prompt. Try saying more."),
          };
    },
    [ask]
  );

  const askProject = useCallback(
    async (
      mode: AssistantMode,
      turns: AssistantTurn[]
    ): Promise<AssistantRound<SuggestedProject>> => {
      const allowed = iconChoices(PROJECT_ICONS);

      const paths = s.assistantSeesVault
        ? vaultNotes(plugin.app)
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, MAX_VAULT_NOTES)
            .map((n) => n.path)
        : [];
      const r = await ask(
        promptProject(mode, allowed, PROJECT_COLORS, paths),
        turns
      );
      if (r.error) return { error: r.error };
      if (r.question) return { question: r.question, options: r.options };
      const draft = parseProject(
        r.raw ?? null,
        allowed,
        PROJECT_COLORS,
        paths
      );
      return draft
        ? { draft }
        : {
            error: tr("The assistant did not name the project. Try saying more."),
          };
    },
    [ask, plugin, s.assistantSeesVault]
  );

  const askField = useCallback(
    async (
      system: string,
      turns: AssistantTurn[],
      maxChars: number
    ): Promise<AssistantRound<string>> => {

      const seeded = turns.length
        ? turns
        : [{ role: "user" as const, text: "Write it." }];
      const r = await ask(system, seeded);
      if (r.error) return { error: r.error };
      if (r.question) return { question: r.question, options: r.options };
      const text = parseText(r.raw ?? null, maxChars);
      return text
        ? { draft: text }
        : {
            error: tr("The assistant came back empty. Try again, or say more."),
          };
    },
    [ask]
  );

  const askDescription = useCallback(
    (ctx: { name: string; body: string }, turns: AssistantTurn[]) =>
      askField(promptDescription(ctx), turns, 140),
    [askField]
  );

  const askInstructions = useCallback(
    (
      ctx: { name: string; notes: readonly string[]; current: string },
      turns: AssistantTurn[]
    ) => askField(promptInstructions(ctx), turns, 2000),
    [askField]
  );

  const askNotes = useCallback(
    async (
      ctx: { name: string; instructions: string; picked: readonly string[] },
      turns: AssistantTurn[]
    ): Promise<AssistantRound<string[]>> => {
      if (!s.assistantSeesVault)
        return {
          error: tr(
            "Let the assistant see your note names first (below) — it never reads what is inside them."
          ),
        };
      const paths = vaultNotes(plugin.app)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, MAX_VAULT_NOTES)
        .map((n) => n.path);
      const seeded = turns.length
        ? turns
        : [{ role: "user" as const, text: "Find them." }];
      const r = await ask(
        promptNotes({ ...ctx, paths }),
        seeded
      );
      if (r.error) return { error: r.error };
      if (r.question) return { question: r.question, options: r.options };
      const notes = parseNotes(r.raw ?? null, paths, ctx.picked);
      return notes.length
        ? { draft: notes }
        : {
            error: tr(
              "No note in the vault fits yet — try naming the project, or saying what it is about."
            ),
          };
    },
    [ask, plugin, s.assistantSeesVault]
  );

  const allowVault = useCallback(async () => {
    s.assistantSeesVault = true;
    await plugin.saveSettings();
  }, [plugin, s]);

  const models = useMemo(() => {
    const freeIds = s.freeModels?.openrouter ?? [];

    const all = [
      ...new Set([...(s.activeModels?.openrouter ?? []), ...freeIds]),
    ];
    return all.sort(
      (a, b) =>
        Number(isFree(b, freeIds)) - Number(isFree(a, freeIds)) ||
        a.localeCompare(b)
    );
  }, [s.activeModels, s.freeModels]);

  const chooseModel = useCallback(
    async (model: string) => {
      s.assistantModel = model;
      s.assistantProvider = model ? "openrouter" : "";
      await plugin.saveSettings();
    },
    [plugin, s]
  );

  const freeModels = useMemo(
    () => models.filter((m) => isFree(m, s.freeModels?.openrouter ?? [])),
    [models, s.freeModels]
  );

  return {
    target,
    models,
    freeModels,
    chooseModel,
    unavailable,
    askSkill,
    askProject,
    askDescription,
    askInstructions,
    askNotes,
    allowVault,
    seesVault: s.assistantSeesVault,
  };
}

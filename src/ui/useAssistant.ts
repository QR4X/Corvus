import { useCallback, useMemo } from "react";
import { resolveLocale } from "../i18n";
import type CorvusPlugin from "../main";
import { getProvider } from "../providers";
import {
  ehFree,
  escolherAssistente,
  motivoIndisponivel,
} from "../assistant/model";
import {
  lerNotas,
  lerProjeto,
  lerSkill,
  lerTexto,
  type ProjetoSugerido,
  type SkillSugerido,
} from "../assistant/parse";
import {
  appLanguage,
  promptDescricao,
  promptInstrucoes,
  promptNotas,
  promptProjeto,
  promptSkill,
  TETO_NOTAS,
  type ModoAssistente,
} from "../assistant/prompt";
import { pedirAjuda, type TurnoAssistente } from "../assistant/run";
import { PROJECT_COLORS, PROJECT_ICONS } from "../projects";
import { SKILL_ICONS } from "../skills/skillFile";
import { ICON_CATALOG } from "../iconCatalog";
import { vaultNotes } from "./notePicker";
import { tr } from "../i18n/tr";

export interface RodadaAssistente<T> {
  pergunta?: string;

  opcoes?: string[];
  erro?: string;
  draft?: T;
}

function icones(curtos: readonly string[]): string[] {
  const todos = new Set(curtos);
  for (const c of ICON_CATALOG) for (const i of c.icons) todos.add(i);
  return [...todos];
}

export function useAssistant(plugin: CorvusPlugin) {
  const s = plugin.settings;

  const idioma = appLanguage(resolveLocale(s.language));

  const alvo = useMemo(
    () =>
      escolherAssistente({
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

  const indisponivel = useMemo(
    () =>
      motivoIndisponivel(alvo, (id) =>
        !!plugin.providerCredential(id).trim()
      ),
    [alvo, plugin]
  );

  const rodar = useCallback(
    async (sistema: string, turnos: TurnoAssistente[]) => {
      if (!alvo) return { erro: indisponivel ?? tr("Assistant not available.") };
      return pedirAjuda({
        provider: getProvider(alvo.provider),
        apiKey: plugin.providerCredential(alvo.provider),
        model: alvo.model,
        sistema,
        turnos,
      });
    },
    [alvo, indisponivel, plugin]
  );

  const pedirSkill = useCallback(
    async (
      modo: ModoAssistente,
      turnos: TurnoAssistente[]
    ): Promise<RodadaAssistente<SkillSugerido>> => {
      const permitidos = icones(SKILL_ICONS);
      const r = await rodar(
        promptSkill(modo, permitidos, PROJECT_COLORS, idioma),
        turnos
      );
      if (r.erro) return { erro: r.erro };
      if (r.pergunta) return { pergunta: r.pergunta, opcoes: r.opcoes };
      const draft = lerSkill(
        r.bruto ?? null,
        permitidos,
        SKILL_ICONS[0],
        PROJECT_COLORS
      );
      return draft
        ? { draft }
        : {
            erro: tr("The assistant did not write a prompt. Try saying more."),
          };
    },
    [rodar, idioma]
  );

  const pedirProjeto = useCallback(
    async (
      modo: ModoAssistente,
      turnos: TurnoAssistente[]
    ): Promise<RodadaAssistente<ProjetoSugerido>> => {
      const permitidos = icones(PROJECT_ICONS);

      const caminhos = s.assistantSeesVault
        ? vaultNotes(plugin.app)
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, TETO_NOTAS)
            .map((n) => n.path)
        : [];
      const r = await rodar(
        promptProjeto(modo, permitidos, PROJECT_COLORS, caminhos, idioma),
        turnos
      );
      if (r.erro) return { erro: r.erro };
      if (r.pergunta) return { pergunta: r.pergunta, opcoes: r.opcoes };
      const draft = lerProjeto(
        r.bruto ?? null,
        permitidos,
        PROJECT_COLORS,
        caminhos
      );
      return draft
        ? { draft }
        : {
            erro: tr("The assistant did not name the project. Try saying more."),
          };
    },
    [rodar, plugin, s.assistantSeesVault, idioma]
  );

  const pedirCampo = useCallback(
    async (
      sistema: string,
      turnos: TurnoAssistente[],
      teto: number
    ): Promise<RodadaAssistente<string>> => {

      const comAlgo = turnos.length
        ? turnos
        : [{ quem: "pessoa" as const, texto: "Write it." }];
      const r = await rodar(sistema, comAlgo);
      if (r.erro) return { erro: r.erro };
      if (r.pergunta) return { pergunta: r.pergunta, opcoes: r.opcoes };
      const texto = lerTexto(r.bruto ?? null, teto);
      return texto
        ? { draft: texto }
        : {
            erro: tr("The assistant came back empty. Try again, or say more."),
          };
    },
    [rodar]
  );

  const pedirDescricao = useCallback(
    (ctx: { name: string; body: string }, turnos: TurnoAssistente[]) =>
      pedirCampo(promptDescricao({ ...ctx, idioma }), turnos, 140),
    [pedirCampo, idioma]
  );

  const pedirInstrucoes = useCallback(
    (
      ctx: { name: string; notes: readonly string[]; atual: string },
      turnos: TurnoAssistente[]
    ) => pedirCampo(promptInstrucoes({ ...ctx, idioma }), turnos, 2000),
    [pedirCampo, idioma]
  );

  const pedirNotas = useCallback(
    async (
      ctx: { name: string; instructions: string; escolhidas: readonly string[] },
      turnos: TurnoAssistente[]
    ): Promise<RodadaAssistente<string[]>> => {
      if (!s.assistantSeesVault)
        return {
          erro: tr(
            "Let the assistant see your note names first (below) — it never reads what is inside them."
          ),
        };
      const caminhos = vaultNotes(plugin.app)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, TETO_NOTAS)
        .map((n) => n.path);
      const comAlgo = turnos.length
        ? turnos
        : [{ quem: "pessoa" as const, texto: "Find them." }];
      const r = await rodar(
        promptNotas({ ...ctx, caminhos, idioma }),
        comAlgo
      );
      if (r.erro) return { erro: r.erro };
      if (r.pergunta) return { pergunta: r.pergunta, opcoes: r.opcoes };
      const notas = lerNotas(r.bruto ?? null, caminhos, ctx.escolhidas);
      return notas.length
        ? { draft: notas }
        : {
            erro: tr(
              "No note in the vault fits yet — try naming the project, or saying what it is about."
            ),
          };
    },
    [rodar, plugin, s.assistantSeesVault, idioma]
  );

  const deixarVerNotas = useCallback(async () => {
    s.assistantSeesVault = true;
    await plugin.saveSettings();
  }, [plugin, s]);

  const modelos = useMemo(() => {
    const livres = s.freeModels?.openrouter ?? [];

    const todos = [
      ...new Set([...(s.activeModels?.openrouter ?? []), ...livres]),
    ];
    return todos.sort(
      (a, b) =>
        Number(ehFree(b, livres)) - Number(ehFree(a, livres)) ||
        a.localeCompare(b)
    );
  }, [s.activeModels, s.freeModels]);

  const escolherModelo = useCallback(
    async (model: string) => {
      s.assistantModel = model;
      s.assistantProvider = model ? "openrouter" : "";
      await plugin.saveSettings();
    },
    [plugin, s]
  );

  const livres = useMemo(
    () => modelos.filter((m) => ehFree(m, s.freeModels?.openrouter ?? [])),
    [modelos, s.freeModels]
  );

  return {
    alvo,
    modelos,
    livres,
    escolherModelo,
    indisponivel,
    pedirSkill,
    pedirProjeto,
    pedirDescricao,
    pedirInstrucoes,
    pedirNotas,
    deixarVerNotas,
    veOVault: s.assistantSeesVault,
  };
}

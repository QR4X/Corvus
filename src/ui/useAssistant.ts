// src/ui/useAssistant.ts
// A ponte entre o painel e o motor: pega o alvo das settings, monta o prompt
// certo e devolve o rascunho já VALIDADO.
//
// Ela existe pra que os dois formulários (skill e projeto) não repitam a mesma
// dança de resolver provider, achar a chave, montar o prompt e desconfiar da
// resposta. O que o formulário vê é uma função que devolve campos prontos —
// ou uma frase dizendo por que não deu.

import { useCallback, useMemo } from "react";
import { resolverIdioma } from "../i18n";
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
  idiomaDoApp,
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

/** Resultado de uma rodada, do jeito que o painel entende. */
export interface RodadaAssistente<T> {
  pergunta?: string;
  /** As pastilhas de resposta, quando a pergunta oferece (ver prompt.ts). */
  opcoes?: string[];
  erro?: string;
  draft?: T;
}

/** Todos os ícones que a assistente pode escolher: a grade curta + o catálogo.
 *  Ela vê o mesmo acervo que a pessoa vê no "+", nem mais nem menos. */
function icones(curtos: readonly string[]): string[] {
  const todos = new Set(curtos);
  for (const c of ICON_CATALOG) for (const i of c.icons) todos.add(i);
  return [...todos];
}

export function useAssistant(plugin: CorvusPlugin) {
  const s = plugin.settings;
  /** O idioma do app — e o único em que ela responde (ver prompt.ts). */
  const idioma = idiomaDoApp(resolverIdioma(s.language));

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

  /** A conversa inteira numa chamada: o painel guarda os turnos, a gente só
   *  monta e desconfia do que volta. */
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
      // As notas só saem daqui com a chave ligada nas settings — e mesmo assim
      // só os CAMINHOS, nunca o conteúdo. As mais recentes primeiro: é onde a
      // pessoa está trabalhando, e é o teto que cabe no prompt.
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

  /**
   * UM campo, escrito a partir do que o formulário já tem.
   *
   * Sem modo guiado: o contexto já está na tela, e uma pergunta antes de
   * escrever uma linha custaria mais que a linha. O modelo ainda pode pedir
   * um esclarecimento se precisar — o painel mostra e a pessoa responde.
   */
  const pedirCampo = useCallback(
    async (
      sistema: string,
      turnos: TurnoAssistente[],
      teto: number
    ): Promise<RodadaAssistente<string>> => {
      // Campo vazio e nada dito: o pedido é o próprio contexto. Sem um turno
      // de usuário, alguns modelos não respondem nada.
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

  /**
   * Procura NOTAS do vault pra um projeto — o "me ajuda a coletar".
   *
   * Só com a chave `assistantSeesVault` ligada: a matéria-prima aqui é o nome
   * das notas da pessoa, e isso só sai do aparelho com o consentimento dela.
   * Desligada, devolve a frase que diz isso em vez de um erro genérico — o
   * passo de Notas mostra o botão que liga, bem ao lado.
   */
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

  /** Liga a chave que deixa a assistente ver os NOMES das notas (nunca o
   *  conteúdo). É um toque da pessoa, no passo de Notas — a mesma chave das
   *  settings, só que onde se percebe que precisa dela. */
  const deixarVerNotas = useCallback(async () => {
    s.assistantSeesVault = true;
    await plugin.saveSettings();
  }, [plugin, s]);

  /**
   * Os modelos que dá pra usar aqui, e o que está em uso.
   *
   * Isto existe pra o painel poder TROCAR de modelo sem mandar a pessoa pras
   * settings. Quem chegou até aqui está no meio de criar um skill, e o motivo
   * mais comum pra querer trocar é o resultado que acabou de aparecer —
   * texto ruim, ou no idioma errado. Fazer a volta pelas configurações nesse
   * momento é perder o que estava escrito.
   *
   * Free primeiro: é o que a assistente foi feita pra usar, e é o que a
   * pessoa quer achar sem procurar.
   */
  const modelos = useMemo(() => {
    const livres = s.freeModels?.openrouter ?? [];
    // Os grátis descobertos entram na lista mesmo sem estar em `activeModels`:
    // quem escaneou e ainda não curou nada teria a lista vazia justamente do
    // que a assistente foi feita pra usar.
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

  /** Quais dos listados são grátis — o painel etiqueta com isto. */
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

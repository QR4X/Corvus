import type { TurnoAssistente } from "./run";
import { tr } from "../i18n/tr";

export type FaseRun =
  | "parada"
  | "rodando"
  | "perguntando"
  | "pronto"
  | "erro";

export interface Run {
  fase: FaseRun;

  turnos: TurnoAssistente[];

  pergunta: string;
  opcoes: string[];

  resultado: unknown;
  erro: string;

  inicio: number;
}

const PARADA: Run = {
  fase: "parada",
  turnos: [],
  pergunta: "",
  opcoes: [],
  resultado: null,
  erro: "",
  inicio: 0,
};

const runs = new Map<string, Run>();
const ouvintes = new Map<string, Set<() => void>>();

function avisar(chave: string): void {
  for (const f of ouvintes.get(chave) ?? []) f();
}

export function lerRun(chave: string): Run {
  return runs.get(chave) ?? PARADA;
}

export function assinar(chave: string, ouvinte: () => void): () => void {
  const set = ouvintes.get(chave) ?? new Set();
  set.add(ouvinte);
  ouvintes.set(chave, set);
  return () => set.delete(ouvinte);
}

function por(chave: string, mudanca: Partial<Run>): void {
  runs.set(chave, { ...lerRun(chave), ...mudanca });
  avisar(chave);
}

export interface Rodada {
  pergunta?: string;
  opcoes?: string[];
  erro?: string;
  draft?: unknown;
}

export function comecarRodada(
  chave: string,
  turnos: TurnoAssistente[],
  chamar: (turnos: TurnoAssistente[]) => Promise<Rodada>,
  aoTerminar?: (r: Run) => void
): void {
  por(chave, {
    fase: "rodando",
    inicio: Date.now(),
    turnos,
    pergunta: "",
    opcoes: [],
    erro: "",
    resultado: null,
  });
  void chamar(turnos)
    .then((r) => {
      if (r.erro) {
        por(chave, { fase: "erro", erro: r.erro });
      } else if (r.pergunta) {

        por(chave, {
          fase: "perguntando",
          pergunta: r.pergunta,
          opcoes: r.opcoes ?? [],
          turnos: [...turnos, { quem: "assistente", texto: r.pergunta }],
        });
      } else {
        por(chave, { fase: "pronto", resultado: r.draft ?? null });
      }
      aoTerminar?.(lerRun(chave));
    })
    .catch((e: unknown) => {

      por(chave, {
        fase: "erro",
        erro: (e as Error)?.message || tr("The assistant could not answer."),
      });
      aoTerminar?.(lerRun(chave));
    });
}

export function limparRun(chave: string): void {
  runs.delete(chave);
  avisar(chave);
}

export function _resetRuns(): void {
  runs.clear();
  ouvintes.clear();
}

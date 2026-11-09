import type { Lancamento } from "./dailyLedger";

export type Anotador = (provider: string, model: string, delta: Partial<Lancamento>) => void;

let atual: Anotador | null = null;

export function definirAnotadorDeUso(fn: Anotador | null): void {
  atual = fn;
}

export function anotarUso(provider: string, model: string, delta: Partial<Lancamento>): void {
  atual?.(provider, model, delta);
}

export type GuardaDeGasto = (provider: string, model: string) => void;

let guarda: GuardaDeGasto | null = null;

export function definirGuardaDeGasto(fn: GuardaDeGasto | null): void {
  guarda = fn;
}

export function conferirGasto(provider: string, model: string): void {
  guarda?.(provider, model);
}

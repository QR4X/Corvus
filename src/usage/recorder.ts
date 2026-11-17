import type { LedgerEntry } from "./dailyLedger";

type UsageRecorder = (provider: string, model: string, delta: Partial<LedgerEntry>) => void;

let recorder: UsageRecorder | null = null;

export function setUsageRecorder(fn: UsageRecorder | null): void {
  recorder = fn;
}

export function recordUsage(provider: string, model: string, delta: Partial<LedgerEntry>): void {
  recorder?.(provider, model, delta);
}

type SpendGuard = (provider: string, model: string) => void;

let spendGuard: SpendGuard | null = null;

export function setSpendGuard(fn: SpendGuard | null): void {
  spendGuard = fn;
}

export function checkSpend(provider: string, model: string): void {
  spendGuard?.(provider, model);
}

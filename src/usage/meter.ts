import { Notice } from "obsidian";
import type { CorvusSettings } from "../settings";
import { ProviderError } from "../providers/base";
import { tr } from "../i18n/tr";
import { addEntry, prune, type LedgerEntry } from "./dailyLedger";
import { isPaid, spendToday, crossedMarks, usd } from "./dailySpend";
import { setUsageRecorder, setSpendGuard } from "./recorder";

const FLUSH_DELAY_MS = 5000;

export class UsageMeter {
  private flushTimer: number | null = null;

  constructor(
    private readonly settings: () => CorvusSettings,
    private readonly save: () => Promise<void>
  ) {}

  install(): () => void {
    setUsageRecorder((provider, model, delta) => this.record(provider, model, delta));
    setSpendGuard((provider, model) => this.guard(provider, model));
    return () => {
      setUsageRecorder(null);
      setSpendGuard(null);
      if (this.flushTimer === null) return;
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
      void this.save();
    };
  }

  record(provider: string, model: string, delta: Partial<LedgerEntry>): void {
    const s = this.settings();
    const now = new Date();
    const ledger = (s.dailyUsage ??= {});
    const limit = s.dailySpendLimit ?? 0;
    const counts = limit > 0 && ((delta.i ?? 0) > 0 || (delta.o ?? 0) > 0);
    const before = counts ? spendToday(ledger, now).total : 0;
    addEntry(ledger, now, provider, model, delta);
    prune(ledger, now);
    if (counts) {
      const after = spendToday(ledger, now).total;
      for (const mark of crossedMarks(before, after, limit)) this.warn(mark, after, limit);
    }
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.save();
    }, FLUSH_DELAY_MS);
  }

  guard(provider: string, model: string): void {
    const s = this.settings();
    const limit = s.dailySpendLimit ?? 0;
    if (!(limit > 0) || !s.blockAtLimit || !isPaid(provider, model)) return;
    const { total } = spendToday(s.dailyUsage ?? {}, new Date());
    if (total < limit) return;
    throw new ProviderError(
      tr(
        "Today's {limit} spending limit is reached ({spent} spent), so paid models are paused until midnight. Free and local models still work, or raise the limit in Settings › Chat › Daily spending.",
        { limit: usd(limit), spent: usd(total) }
      ),
      "unknown"
    );
  }

  private warn(mark: 80 | 100, spent: number, limit: number): void {
    const values = { limit: usd(limit), spent: usd(spent) };
    if (mark === 80) {
      new Notice(tr("You've used 80% of today's {limit} spending limit ({spent}).", values), 8000);
      return;
    }
    new Notice(
      this.settings().blockAtLimit
        ? tr(
            "Today's {limit} spending limit is reached ({spent}). Paid models pause until midnight; free and local ones still work.",
            values
          )
        : tr(
            "Today's {limit} spending limit is reached ({spent}). Turn on “Stop paid models at the limit” in settings to pause them.",
            values
          ),
      12000
    );
  }
}

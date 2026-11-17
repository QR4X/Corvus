import { Notice } from "obsidian";
import type { CorvusSettings } from "../settings";
import { ProviderError } from "../providers/base";
import { tr } from "../i18n/tr";
import { lancar, podar, type Lancamento } from "./dailyLedger";
import { ehPago, gastoDeHoje, marcosCruzados, usd } from "./dailySpend";
import { definirAnotadorDeUso, definirGuardaDeGasto } from "./recorder";

const FLUSH_DELAY_MS = 5000;

export class UsageMeter {
  private flushTimer: number | null = null;

  constructor(
    private readonly settings: () => CorvusSettings,
    private readonly save: () => Promise<void>
  ) {}

  install(): () => void {
    definirAnotadorDeUso((provider, model, delta) => this.record(provider, model, delta));
    definirGuardaDeGasto((provider, model) => this.guard(provider, model));
    return () => {
      definirAnotadorDeUso(null);
      definirGuardaDeGasto(null);
      if (this.flushTimer === null) return;
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
      void this.save();
    };
  }

  record(provider: string, model: string, delta: Partial<Lancamento>): void {
    const s = this.settings();
    const now = new Date();
    const ledger = (s.usoDoDia ??= {});
    const limit = s.limiteGastoDiario ?? 0;
    const counts = limit > 0 && ((delta.i ?? 0) > 0 || (delta.o ?? 0) > 0);
    const before = counts ? gastoDeHoje(ledger, now).total : 0;
    lancar(ledger, now, provider, model, delta);
    podar(ledger, now);
    if (counts) {
      const after = gastoDeHoje(ledger, now).total;
      for (const mark of marcosCruzados(before, after, limit)) this.warn(mark, after, limit);
    }
    if (this.flushTimer !== null) return;
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.save();
    }, FLUSH_DELAY_MS);
  }

  guard(provider: string, model: string): void {
    const s = this.settings();
    const limit = s.limiteGastoDiario ?? 0;
    if (!(limit > 0) || !s.travarNoLimite || !ehPago(provider, model)) return;
    const { total } = gastoDeHoje(s.usoDoDia ?? {}, new Date());
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
      this.settings().travarNoLimite
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

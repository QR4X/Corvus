// src/usage/export.ts
// Exportadores do Usage report — Markdown + PDF.
//
// Markdown: gera string formatada, salva em corvus-ai/reports/usage-{YYYY-MM-DD_HH-MM-SS}-{rand}.md
// PDF: usa Electron BrowserWindow.printToPDF quando disponível (desktop),
//      cai pra window.print() (com CSS print-only) no resto.

import type { App } from "obsidian";
import { ensureFolder } from "../core/chatPersistence";
import { formatUsd } from "./pricing";
import {
  type UsageAggregate,
  type UsageBucket,
  sortBucketEntries,
} from "./aggregate";
import { formatCompact } from "./format";

/** Pasta default pra reports — fica fora do generationPath pra não poluir. */
const REPORTS_FOLDER = "corvus-ai/reports";

function tsFileName(): string {
  // v0.1.228: toISOString().slice(0,19) descarta os ms — dois reports no mesmo
  // segundo colidiam e um sobrescrevia o outro. Sufixo curto aleatório evita.
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const rand = crypto.randomUUID().slice(0, 8);
  return `${stamp}-${rand}`;
}

/** O mesmo formato compacto que o cartão da home usa (ver usage/format.ts). */
const formatNumber = formatCompact;

function periodLabel(agg: UsageAggregate, periodDays: number): string {
  if (periodDays > 0) return `últimos ${periodDays} dias`;
  if (agg.periodStart && agg.periodEnd) {
    if (agg.periodStart === agg.periodEnd) return agg.periodStart;
    return `${agg.periodStart} a ${agg.periodEnd}`;
  }
  return "todo o histórico";
}

function bucketCostCell(b: UsageBucket): string {
  const costStr = formatUsd(b.cost);
  return b.hasUnknownCost ? `${costStr}*` : costStr;
}

// ============================================================
// MARKDOWN export
// ============================================================

export function generateUsageMarkdown(
  agg: UsageAggregate,
  periodDays: number,
  chatsPath: string
): string {
  const generatedAt = new Date().toISOString();
  const lines: string[] = [];

  lines.push("---");
  lines.push(`generated: ${JSON.stringify(generatedAt)}`);
  lines.push(`period: ${JSON.stringify(periodLabel(agg, periodDays))}`);
  lines.push(`chats_path: ${JSON.stringify(chatsPath)}`);
  lines.push(`total_cost_usd: ${agg.total.cost.toFixed(4)}`);
  lines.push(`total_chats: ${agg.total.chats}`);
  lines.push(`total_tokens_in: ${agg.total.tokensIn}`);
  lines.push(`total_tokens_out: ${agg.total.tokensOut}`);
  lines.push(`has_unknown_pricing: ${agg.total.hasUnknownCost}`);
  lines.push("tags:");
  lines.push("  - corvus-usage-report");
  lines.push("---");
  lines.push("");

  lines.push(`# Corvus — Usage Report`);
  lines.push("");
  lines.push(`> Period: **${periodLabel(agg, periodDays)}** · generated ${generatedAt}`);
  lines.push("");

  // ===== Summary =====
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`- **Estimated total spend:** ${formatUsd(agg.total.cost)}${agg.total.hasUnknownCost ? " (some model has no public price — see `*` below)" : ""}`);
  lines.push(`- **Tokens used:** ${formatNumber(agg.total.tokensIn)} in / ${formatNumber(agg.total.tokensOut)} out`);
  lines.push(`- **Chats:** ${agg.total.chats}`);
  if (agg.periodStart && agg.periodEnd) {
    lines.push(`- **Window:** ${agg.periodStart} → ${agg.periodEnd}`);
  }
  lines.push("");

  // ===== By provider =====
  const providerRows = sortBucketEntries(agg.byProvider);
  if (providerRows.length > 0) {
    lines.push(`## By provider`);
    lines.push("");
    lines.push(`| Provider | Chats | Tokens in | Tokens out | Cost |`);
    lines.push(`| -------- | --------- | --------- | ---------- | ----- |`);
    for (const [name, b] of providerRows) {
      lines.push(`| ${name} | ${b.chats} | ${formatNumber(b.tokensIn)} | ${formatNumber(b.tokensOut)} | ${bucketCostCell(b)} |`);
    }
    lines.push("");
  }

  // ===== By model (top 15) =====
  const modelRows = sortBucketEntries(agg.byModel).slice(0, 15);
  if (modelRows.length > 0) {
    lines.push(`## By model (top 15)`);
    lines.push("");
    lines.push(`| Model | Chats | Tokens in | Tokens out | Cost |`);
    lines.push(`| ------ | --------- | --------- | ---------- | ----- |`);
    for (const [name, b] of modelRows) {
      lines.push(`| \`${name}\` | ${b.chats} | ${formatNumber(b.tokensIn)} | ${formatNumber(b.tokensOut)} | ${bucketCostCell(b)} |`);
    }
    lines.push("");
  }

  // ===== By mode =====
  const modeRows = sortBucketEntries(agg.byMode);
  if (modeRows.length > 0) {
    lines.push(`## By mode`);
    lines.push("");
    lines.push(`| Mode | Chats | Tokens in | Tokens out | Cost |`);
    lines.push(`| ---- | --------- | --------- | ---------- | ----- |`);
    for (const [name, b] of modeRows) {
      lines.push(`| ${name} | ${b.chats} | ${formatNumber(b.tokensIn)} | ${formatNumber(b.tokensOut)} | ${bucketCostCell(b)} |`);
    }
    lines.push("");
  }

  // ===== Top chats =====
  const top = agg.chats.slice(0, 10);
  if (top.length > 0) {
    lines.push(`## Top 10 chats (by cost)`);
    lines.push("");
    lines.push(`| Title | Mode | Model | Tokens (in/out) | Cost |`);
    lines.push(`| ------ | ---- | ------ | --------------- | ----- |`);
    for (const c of top) {
      const titleTruncated = c.title.length > 50 ? c.title.slice(0, 47) + "..." : c.title;
      const cost = c.cost == null ? "—" : formatUsd(c.cost);
      lines.push(`| ${titleTruncated} | ${c.mode} | \`${c.model}\` | ${formatNumber(c.tokensIn)} / ${formatNumber(c.tokensOut)} | ${cost} |`);
    }
    lines.push("");
  }

  if (agg.total.hasUnknownCost) {
    lines.push("");
    lines.push(`> * Partial estimate — at least one model has no public price,`);
    lines.push(`> so the total above is a floor, not the full amount.`);
  }

  return lines.join("\n");
}

// ============================================================
// File save helpers
// ============================================================

export interface ExportResult {
  path: string;
  format: "md" | "html" | "pdf";
}

/** Salva o Markdown no vault em corvus-ai/reports/. */
export async function saveUsageMarkdown(
  app: App,
  agg: UsageAggregate,
  periodDays: number,
  chatsPath: string,
  basePath = REPORTS_FOLDER
): Promise<ExportResult> {
  const md = generateUsageMarkdown(agg, periodDays, chatsPath);
  const path = `${basePath}/usage-${tsFileName()}.md`;
  // v0.1.228: erro de IO subia cru pra UI; relança com o path pro Notice ser útil.
  try {
    await ensureFolder(app.vault.adapter, basePath);
    await app.vault.adapter.write(path, md);
  } catch (e) {
    throw new Error(`Falha ao salvar o report em ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { path, format: "md" };
}

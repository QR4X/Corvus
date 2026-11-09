import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { App } from "obsidian";
import type CorvusPlugin from "../main";
import { getProvider } from "../providers";
import type { EstadoDaChave } from "../providers/openrouter";
import { prettyModelName } from "../providers/modelDescriptions";
import { formatCompact } from "../usage/format";
import {
  CHAVE_LIMITE_GASTO,
  emQuanto,
  fracaoQueSobra,
  nivel,
  remainingToday,
  type Cartao,
  type Medidor,
} from "../usage/remainingToday";
import { usd } from "../usage/dailySpend";
import { providerIcon } from "./ChatList";
import { Icon } from "./Icon";
import { uiLocale, tr } from "../i18n/tr";

const CHAVE_ABERTOS = "corvus-left-today-open";

function lerAbertos(app: App): Set<string> {
  try {
    const v: unknown = app.loadLocalStorage(CHAVE_ABERTOS);
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function gravarAbertos(app: App, abertos: Set<string>): void {
  try {
    app.saveLocalStorage(CHAVE_ABERTOS, abertos.size ? Array.from(abertos) : null);
  } catch { void 0; }
}

function numero(n: number, unidade: Medidor["unidade"]): string {
  if (unidade === "usd") return usd(n);
  return unidade === "tokens" ? formatCompact(n) : Math.round(n).toLocaleString(uiLocale());
}

function quantos(n: number, unidade: Medidor["unidade"]): string {
  if (unidade === "tokens") return tr("{n} tokens", { n: numero(n, unidade) });
  if (unidade === "usd") return numero(n, unidade);
  return n === 1 ? tr("1 request") : tr("{n} requests", { n: numero(n, unidade) });
}

function sobram(n: number, unidade: Medidor["unidade"]): string {
  return n === 1 && unidade !== "usd" ? tr("1 left") : tr("{n} left", { n: numero(n, unidade) });
}

function usadosDe(usado: number, limite: number, unidade: Medidor["unidade"]): string {
  const u = numero(usado, unidade);
  if (unidade === "usd") return tr("{used} of {limit} spent", { used: u, limit: numero(limite, unidade) });
  if (unidade === "tokens") {
    return tr("{used} of {limit} tokens used", { used: u, limit: numero(limite, unidade) });
  }
  return limite === 1
    ? tr("{used} of 1 request used", { used: u })
    : tr("{used} of {limit} requests used", { used: u, limit: numero(limite, unidade) });
}

function dinheiro(n: number): string {
  if (n === 0) return "$0.00";
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function voltaDoCredito(volta: string): string {
  if (volta === "daily") return tr("resets daily");
  if (volta === "weekly") return tr("resets weekly");
  if (volta === "monthly") return tr("resets monthly");
  return tr("resets {when}", { when: volta });
}

function nomeDo(m: Medidor): string {
  return m.modelo ? prettyModelName(m.modelo) : m.rotulo;
}

export function LeftToday({ plugin }: { plugin: CorvusPlugin }) {
  const s = plugin.settings;

  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const [abertos, setAbertos] = useState(() => lerAbertos(plugin.app));
  const alternar = (provider: string) => {
    const novo = new Set(abertos);
    if (novo.has(provider)) novo.delete(provider);
    else novo.add(provider);
    setAbertos(novo);
    gravarAbertos(plugin.app, novo);
  };

  const chaveOR = plugin.providerCredential("openrouter").trim();
  const [viva, setViva] = useState<EstadoDaChave | null | undefined>(undefined);
  const [lendo, setLendo] = useState(false);
  const perguntar = useCallback(async () => {
    if (!chaveOR) return;
    setLendo(true);
    try {
      setViva((await getProvider("openrouter").keyStatus?.(chaveOR)) ?? null);
      setAgora(new Date());
    } finally {
      setLendo(false);
    }
  }, [chaveOR]);
  useEffect(() => {
    void perguntar();
  }, [perguntar]);

  const salvarLimite = (chave: string, n: number | null) => {
    if (chave === CHAVE_LIMITE_GASTO) {
      s.limiteGastoDiario = n ?? 0;
      void plugin.saveSettings();
      return;
    }
    const limites = (s.limitesDiarios ??= {});
    if (n == null) delete limites[chave];
    else limites[chave] = n;
    void plugin.saveSettings();
  };

  const cartoes = remainingToday({
    livro: s.usoDoDia ?? {},
    agora,
    comChave: (id) => !!plugin.providerCredential(id).trim(),
    openai: { dataSharing: s.openaiDataSharing === true, tier: s.openaiTier ?? 1 },
    limites: s.limitesDiarios ?? {},
    cotaOpenRouter: s.freeQuota?.openrouter,
    chaveOpenRouter: viva,
    limiteGasto: s.limiteGastoDiario ?? 0,
    travarNoLimite: s.travarNoLimite === true,
  });
  if (cartoes.length === 0) return null;

  return (
    <section className="corvus-home-block corvus-left" aria-label={tr("Left today")}>
      <div className="corvus-home-headrow">
        <span className="corvus-section-label">{tr("Left today")}</span>
      </div>
      <div className="corvus-usage-list">
        {cartoes.map((c) => (
          <CartaoDoDia
            key={c.provider}
            c={c}
            aberto={abertos.has(c.provider)}
            onAlternar={() => alternar(c.provider)}
            onSalvarLimite={salvarLimite}
            atualizar={
              c.provider === "openrouter" && chaveOR
                ? { lendo, ir: () => void perguntar() }
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

function CartaoDoDia({
  c,
  aberto,
  onAlternar,
  onSalvarLimite,
  atualizar,
}: {
  c: Cartao;
  aberto: boolean;
  onAlternar: () => void;
  onSalvarLimite: (chave: string, n: number | null) => void;

  atualizar?: { lendo: boolean; ir: () => void };
}) {
  const idCorpo = `corvus-left-${c.provider}`;

  const comBarra = c.medidores.filter((m) => fracaoQueSobra(m) != null);
  return (
    <div className={aberto ? "corvus-left-prov is-open" : "corvus-left-prov"}>
      <button
        type="button"
        className="corvus-left-head"
        aria-expanded={aberto}
        aria-controls={idCorpo}
        onClick={onAlternar}
      >
        <span className="corvus-card-mark" aria-hidden="true">
          <Icon name={c.provider === "spend" ? "wallet" : providerIcon(c.provider)} size={20} />
        </span>
        <span className="corvus-left-name">{c.nome}</span>
        {aberto && (c.viraEm != null || c.semDia) && (
          <span
            className="corvus-left-reset"
            title={c.viraOnde ? tr("Resets at {when}", { when: c.viraOnde }) : undefined}
          >
            {c.viraEm != null ? tr("resets in {time}", { time: emQuanto(c.viraEm) }) : c.semDia}
          </span>
        )}
        <span className="corvus-left-chev" aria-hidden="true">
          <Icon name="chevron-down" />
        </span>
      </button>

      {aberto ? (
        <div className="corvus-left-body" id={idCorpo}>
          {c.vazio && <p className="corvus-left-note">{c.vazio}</p>}
          {c.medidores.map((m) => (
            <LinhaDoMedidor
              key={m.id}
              m={m}
              ajuda={c.link}
              atualizar={m.id === "openrouter-free" ? atualizar : undefined}
              onSalvarLimite={onSalvarLimite}
            />
          ))}
          {c.credito && <LinhaDoCredito credito={c.credito} />}
          {c.nota && (
            <p className="corvus-left-note">
              {c.nota}
              {c.link && (
                <>
                  {" "}
                  <a
                    className="corvus-left-link"
                    href={c.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {c.link.rotulo}
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      ) : (
        comBarra.length > 0 && (

          <div className="corvus-left-bars" id={idCorpo} onClick={onAlternar}>
            {comBarra.map((m) => (
              <Barra key={m.id} m={m} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function Barra({ m }: { m: Medidor }) {
  const f = fracaoQueSobra(m);
  if (f == null || m.limite == null || m.restante == null) return null;
  const n = nivel(m);
  const texto =
    m.restante === 1 && m.unidade !== "usd"
      ? tr("{name}: 1 of {limit} left", { name: nomeDo(m), limit: numero(m.limite, m.unidade) })
      : tr("{name}: {left} of {limit} left", {
          name: nomeDo(m),
          left: numero(m.restante, m.unidade),
          limit: numero(m.limite, m.unidade),
        });
  return (
    <span
      className={n ? `corvus-left-bar is-${n}` : "corvus-left-bar"}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={m.limite}
      aria-valuenow={m.restante}
      aria-label={texto}
      title={texto}
    >
      <span className="corvus-left-fill" style={{ "--corvus-left": f } as CSSProperties} />
    </span>
  );
}

function LinhaDoMedidor({
  m,
  ajuda,
  atualizar,
  onSalvarLimite,
}: {
  m: Medidor;

  ajuda?: { rotulo: string; url: string };

  atualizar?: { lendo: boolean; ir: () => void };
  onSalvarLimite: (chave: string, n: number | null) => void;
}) {
  const nome = nomeDo(m);
  const n = nivel(m);
  const dinheiro = m.unidade === "usd";
  const valor =
    m.restante != null
      ? sobram(m.restante, m.unidade)
      : dinheiro
        ? tr("{n} spent", { n: numero(m.usado, m.unidade) })
        : quantos(m.usado, m.unidade);
  const conta =
    m.limite != null
      ? usadosDe(m.usado, m.limite, m.unidade)
      : m.limiteEditavel
        ? tr("No daily limit set")
        : null;
  const pe = [conta, m.nota].filter(Boolean).join(" · ");
  return (
    <div className={n ? `corvus-left-row is-${n}` : "corvus-left-row"}>
      <span className="corvus-left-row-name">{nome}</span>
      <span className="corvus-left-row-value">{valor}</span>
      <Barra m={m} />
      {pe && <span className="corvus-left-row-sub">{pe}</span>}
      {m.limiteEditavel ? (
        <EditorDeLimite
          atual={m.limite}
          nome={nome}
          ajuda={ajuda}
          dinheiro={dinheiro}
          onSalvar={(v) => onSalvarLimite(m.limiteEditavel!, v)}
        />
      ) : (
        atualizar && (
          <button
            type="button"
            className="corvus-home-filter is-accent corvus-left-action"
            aria-label={tr("Ask OpenRouter again")}
            disabled={atualizar.lendo}
            onClick={atualizar.ir}
          >
            <Icon name={atualizar.lendo ? "loader" : "refresh-cw"} size={14} />
            <span>{atualizar.lendo ? tr("Asking…") : tr("Refresh")}</span>
          </button>
        )
      )}
    </div>
  );
}

function EditorDeLimite({
  atual,
  nome,
  ajuda,
  dinheiro = false,
  onSalvar,
}: {
  atual?: number;
  nome: string;
  ajuda?: { rotulo: string; url: string };

  dinheiro?: boolean;
  onSalvar: (n: number | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [txt, setTxt] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (aberto) campo.current?.focus();
  }, [aberto]);
  if (!aberto) {
    return (
      <button
        type="button"
        className="corvus-home-filter is-accent corvus-left-action"
        aria-label={
          dinheiro
            ? atual
              ? tr("Edit the daily spending limit")
              : tr("Set the daily spending limit")
            : atual
              ? tr("Edit the daily limit for {name}", { name: nome })
              : tr("Set the daily limit for {name}", { name: nome })
        }
        onClick={() => {
          setTxt(atual ? String(atual) : "");
          setAberto(true);
        }}
      >
        <span>{atual ? tr("Edit") : tr("Set limit")}</span>
      </button>
    );
  }

  const salvar = () => {
    const bruto = (campo.current?.value ?? txt).trim().replace(",", ".");
    const v = Number(bruto);
    const valido = bruto && Number.isFinite(v) && v > 0;
    onSalvar(valido ? (dinheiro ? Math.round(v * 100) / 100 : Math.floor(v)) : null);
    setAberto(false);
  };
  return (
    <>
      <span className="corvus-left-action corvus-left-edit">
        <input
          type="number"
          inputMode="numeric"
          min={dinheiro ? 0 : 1}
          step={dinheiro ? 0.5 : 1}
          className="corvus-left-input"
          value={txt}
          placeholder={dinheiro ? tr("$ a day") : tr("Per day")}
          aria-label={
            dinheiro ? tr("Daily spending limit in dollars") : tr("Requests per day for {name}", { name: nome })
          }
          ref={campo}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") setAberto(false);
          }}
        />
        <button
          type="button"
          className="corvus-icon-btn"
          aria-label={tr("Save limit")}
          onClick={salvar}
        >
          <Icon name="check" />
        </button>
      </span>
      {ajuda && (
        <span className="corvus-left-row-hint">
          {tr("Requests per day.")}{" "}
          <a
            className="corvus-left-link"
            href={ajuda.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {ajuda.rotulo}
          </a>
        </span>
      )}
    </>
  );
}

function LinhaDoCredito({
  credito,
}: {
  credito: NonNullable<Cartao["credito"]>;
}) {
  const comTeto = credito.restante != null;
  const pe = comTeto
    ? [
        credito.gastoHoje != null
          ? tr("{amount} spent today", { amount: dinheiro(credito.gastoHoje) })
          : null,
        credito.volta ? voltaDoCredito(credito.volta) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : tr("No spending cap on this key");
  return (
    <div className="corvus-left-row">
      <span className="corvus-left-row-name">
        {comTeto ? tr("Key credit") : tr("Spent today")}
      </span>
      <span className="corvus-left-row-value">
        {comTeto
          ? tr("{n} left", { n: dinheiro(credito.restante ?? 0) })
          : dinheiro(credito.gastoHoje ?? 0)}
      </span>
      {pe && <span className="corvus-left-row-sub">{pe}</span>}
    </div>
  );
}

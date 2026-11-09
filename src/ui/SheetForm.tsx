// src/ui/SheetForm.tsx
// As peças de FORMULÁRIO da folha: rótulo, campo, texto longo, grade de
// ícones, cores e o botão que conclui.
//
// A folha já sabia oferecer escolhas (Sheet.tsx: linhas, abas, segmentos) —
// tudo coisa de quem ESCOLHE entre o que já existe. Criar um skill ou um
// projeto é outro verbo: é escrever o que ainda não existe. Estas peças são
// esse verbo, e moram aqui em vez de dentro do Sheet porque o Sheet é a
// casca: ele sobe, arrasta e fecha; o que vai dentro é assunto de quem usa.
//
// Uma regra atravessa todas: o rótulo fica ACIMA do campo, nunca dentro dele.
// Rótulo que vive de placeholder some na hora em que a pessoa começa a
// digitar — justamente quando ela ainda precisa dele.

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useSheetFull, useSheetLevel } from "./Sheet";
import { ICON_CATALOG, iconCatalogSize, iconCategoryOf } from "../iconCatalog";
import { peDoWizard } from "./wizard";
import { tr } from "../i18n/tr";

/**
 * Rótulo + explicação + o campo. A unidade do formulário.
 *
 * `div`, e NÃO `label`. Um `<label>` sem `for` associa-se ao PRIMEIRO controle
 * que tiver dentro, e manda pra ele todo toque que caia na área dele — o
 * rótulo, a explicação, e qualquer outro controle. Enquanto cada campo tinha
 * um controle só, isso era um atalho simpático. Quando o painel da assistente
 * passou a morar dentro do mesmo campo, virou bug: tocar no textarea DELE
 * devolvia o cursor pro campo de cima, e a pessoa não conseguia escrever nem
 * apagar no painel — o cursor fugia a cada toque.
 *
 * O que se perde é tocar no rótulo pra focar o campo. Num celular, ninguém
 * mira um rótulo de 12px pra abrir o teclado: mira o campo.
 */
export function SheetField({
  label,
  hint,
  children,
}: {
  label: string;
  /** Uma linha dizendo o que aquilo faz. Só onde o nome não basta. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="corvus-field">
      <span className="corvus-field-label">{label}</span>
      {hint && <span className="corvus-field-hint">{hint}</span>}
      {children}
    </div>
  );
}

/**
 * Põe o cursor no campo — e, no celular, o teclado na tela.
 *
 * Não é o `autoFocus` do React, e a diferença tem dois motivos, os dois já
 * pagos em release:
 *
 * · `autoFocus` chama `focus()` SEM `preventScroll`, e focar um campo rola o
 *   ancestral pra "mostrar" o que já estava visível. É o pulo que a folha
 *   levava ao entrar na busca (ver SearchField, que resolveu isto primeiro) —
 *   e num wizard é o campo subindo e o rodapé indo junto.
 * · `autoFocus` só age na MONTAGEM. Aqui o valor vira true depois, quando a
 *   fila anda de um passo pro outro sem trocar de componente; como dependência
 *   do efeito, cada chegada num passo abre o teclado de novo.
 *
 * `useLayoutEffect` e não `useEffect`: o foco tem que sair no mesmo quadro do
 * toque que abriu a tela. O WebView do Android só levanta o teclado quando o
 * foco é filho de um gesto, e um quadro de atraso já é tarde demais — foi a
 * lição do painel da assistente (0.7.25).
 */
function useFocarCampo<T extends HTMLElement>(ligado?: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (!ligado) return;
    ref.current?.focus({ preventScroll: true });
  }, [ligado]);
  return ref;
}

export function SheetInput({
  value,
  placeholder,
  autoFocus,
  comSpark,
  onChange,
}: {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Abre espaço pro botão da assistente, que mora dentro do campo. Sem isto
   *  o texto passa por baixo dele exatamente quando fica comprido. */
  comSpark?: boolean;
  onChange: (v: string) => void;
}) {
  const ref = useFocarCampo<HTMLInputElement>(autoFocus);
  return (
    <input
      ref={ref}
      // `corvus-field-input`, e não `corvus-input`: esse é o cartão do composer
      // (ver o comentário da regra em styles/main.css).
      className={
        comSpark ? "corvus-field-input corvus-has-spark" : "corvus-field-input"
      }
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

export function SheetTextarea({
  value,
  placeholder,
  rows = 6,
  comSpark,
  autoFocus,
  onChange,
}: {
  value: string;
  placeholder?: string;
  rows?: number;
  /** Ver SheetInput: espaço pro botão da assistente. */
  comSpark?: boolean;
  /** Abre com o teclado. É o caso do wizard: a tela é deste campo, então
   *  chegar nela com o cursor já dentro é uma batida a menos. */
  autoFocus?: boolean;
  onChange: (v: string) => void;
}) {
  const ref = useFocarCampo<HTMLTextAreaElement>(autoFocus);
  return (
    <textarea
      ref={ref}
      className={comSpark ? "corvus-textarea corvus-has-spark" : "corvus-textarea"}
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

/**
 * Escolha única em pílulas — os modos, as opções curtas.
 *
 * É lista, não segmented: o segmented divide a largura em partes iguais e
 * promete que todas as opções cabem na linha. Aqui elas quebram pra segunda
 * linha sem drama.
 */
export function SheetChoices({
  items,
  value,
  onPick,
  label,
}: {
  items: Array<{
    id: string;
    label: string;
    icon?: string;
    /**
     * Quantos itens há lá dentro. Vai em expoente, miúdo: é uma nota de
     * rodapé do nome, não um segundo dado disputando com ele — e diz antes do
     * toque se vale a pena entrar. Só onde a opção ABRE uma lista; opção que
     * é só uma escolha (os modos) não tem o que contar.
     */
    count?: number;
  }>;
  value: string;
  onPick: (id: string) => void;
  label: string;
}) {
  return (
    <div className="corvus-choices" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={it.id === value ? "corvus-choice is-on" : "corvus-choice"}
          aria-pressed={it.id === value}
          /* O nome inteiro vai no rótulo acessível: lido em voz alta, "Work 21"
             não diz o que é o 21 — "Work, 21 icons" diz. */
          aria-label={
            it.count === undefined
              ? undefined
              : tr("{label}, {n} icons", { label: it.label, n: it.count })
          }
          onClick={() => onPick(it.id)}
        >
          {it.icon && <Icon name={it.icon} size={16} />}
          <span>{it.label}</span>
          {it.count !== undefined && (
            <sup className="corvus-choice-count" aria-hidden="true">
              {it.count}
            </sup>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Um azulejo da grade.
 *
 * Mora aqui fora porque a grade curta e o catálogo desenham o MESMO botão —
 * e um azulejo marcado que se pintasse de um jeito num lugar e de outro no
 * outro faria a pessoa duvidar se escolheu a mesma coisa.
 */
function IconTile({
  icon,
  on,
  tint,
  onPick,
}: {
  icon: string;
  on: boolean;
  tint?: string;
  onPick: (icon: string) => void;
}) {
  return (
    <button
      type="button"
      className={
        "corvus-icontile" + (on ? " is-on" : "") + (on && tint ? " is-tinted" : "")
      }
      aria-label={icon}
      aria-pressed={on}
      /* `color`, e não um fundo direto: o fundo do azulejo sai daqui por
         `currentColor`, igual ao brasão. Uma fonte só pra cor. */
      style={on && tint ? { color: tint } : undefined}
      onClick={() => onPick(icon)}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

/**
 * A grade de ícones — a curta, com um "+" no fim que abre o catálogo.
 *
 * A grade curta cabe INTEIRA na folha, sem rolagem interna: grade que rola
 * dentro de folha que também rola é um lugar onde o dedo nunca sabe o que vai
 * acontecer. Ela é a primeira resposta e resolve o caso comum.
 *
 * O "+" é a porta pro resto. Quem abre não está mais preenchendo um
 * formulário: está PROCURANDO — e é o formulário que sai da frente (ver
 * `SheetIconCatalog` e quem o usa).
 */
export function SheetIconGrid({
  icons,
  value,
  onPick,
  onBrowse,
  /**
   * A cor escolhida logo acima. Quando existe, o azulejo marcado vira a
   * MESMA plaquinha do brasão do projeto — cor cheia no ícone, fundo tirado
   * dela (ver `.corvus-icontile.is-on.is-tinted`). Sem ela — o caso das skills,
   * que não têm cor — o marcado continua no accent do app.
   */
  tint,
}: {
  icons: readonly string[];
  value: string;
  onPick: (icon: string) => void;
  /** Tocou no "+". Quem manda é o formulário: é ele que troca de tela. */
  onBrowse: () => void;
  tint?: string;
}) {
  // Um ícone escolhido no catálogo não está na grade curta. Sem isto ele
  // sumia da vista ao voltar — a grade voltava sem NENHUM marcado, e a única
  // pista do que foi escolhido era o cartão de prévia lá em cima. Ele entra na
  // frente, que é onde o olho volta.
  const curtos = icons.includes(value) ? [...icons] : [value, ...icons];

  return (
    <div className="corvus-icongrid" role="group" aria-label={tr("Icon")}>
      {curtos.map((ic) => (
        <IconTile
          key={ic}
          icon={ic}
          on={ic === value}
          tint={tint}
          onPick={onPick}
        />
      ))}
      {/* A porta pros outros — e ela precisa NÃO parecer um ícone.
          Quadrada e do mesmo tamanho, era o 29º desenho da grade: a pessoa
          lia "mais um símbolo que eu não reconheço" e passava direto. Aqui
          ela ocupa DUAS colunas, leva a palavra e diz quantos há do outro
          lado. Largura e texto são as duas coisas que um azulejo de ícone
          nunca tem. */}
      <button
        type="button"
        className="corvus-icontile is-more"
        aria-label={tr("More icons — {n} to choose from", {
          n: iconCatalogSize(),
        })}
        onClick={onBrowse}
      >
        <Icon name="plus" size={18} />
        <span className="corvus-more-rotulo">{tr("More")}</span>
        <span className="corvus-more-conta">{iconCatalogSize()}</span>
      </button>
    </div>
  );
}

/**
 * O CATÁLOGO: a tela de procurar ícone.
 *
 * Ela substitui o formulário inteiro enquanto está aberta — nome, prompt,
 * descrição, tudo sai. Não é economia de espaço: é que procurar ícone é outra
 * tarefa, e um campo de texto no meio dela só serve pra ser esbarrado. Fica o
 * voltar, a cor (quando há uma: é ela que decide como o ícone vai parecer) e
 * os ícones.
 *
 * As categorias são PÍLULAS que quebram de linha, não uma fileira que anda pro
 * lado. Fileira que rola esconde o que não coube, e o que não coube some sem
 * avisar: numa tela de 375px, "Travel" e "Life" ficavam fora da borda e só
 * existiam pra quem pensasse em arrastar. Em pílulas, as dez categorias estão
 * todas na tela antes do primeiro toque.
 */
export function SheetIconCatalog({
  value,
  onPick,
  onBack,
  tint,
  children,
}: {
  value: string;
  onPick: (icon: string) => void;
  onBack: () => void;
  tint?: string;
  /**
   * O que sobrevive do formulário, entre o voltar e as categorias — hoje só
   * o seletor de cor dos projetos. Fica ACIMA dos ícones, e não abaixo:
   * embaixo de uma grade de vinte, mudar a cor pediria rolar de volta pra ver
   * o que mudou.
   */
  children?: ReactNode;
}) {
  // A folha vai pro tamanho grande ao entrar aqui, e não cresce por conta
  // própria depois: esta tela não tem campo pra focar nem nada que a faça
  // crescer sozinha, e na altura do conteúdo apareceriam duas fileiras de
  // ícones — procurar viraria rolar às cegas.
  useSheetFull();
  // E EMPRESTA o título e o voltar à barra de cima enquanto está aberto. Sem
  // isto a barra continuava dizendo "New skill" com a tela cheia de ícones, e
  // a seta dela pulava o formulário inteiro: voltar desfazia dois toques em
  // vez de um.
  useSheetLevel(tr("Icon"), onBack);

  /** Começa na categoria do ícone de agora — quem veio trocar um avião
   *  provavelmente quer outro de viagem, não a primeira pílula. */
  const [aba, setAba] = useState(
    () => iconCategoryOf(value) ?? ICON_CATALOG[0].id
  );
  const atual = ICON_CATALOG.find((c) => c.id === aba) ?? ICON_CATALOG[0];

  return (
    <div className="corvus-iconcat">
      {/* Sem botão de voltar aqui dentro: quem volta é a seta da barra de
          cima, que esta tela agora empresta (useSheetLevel). Enquanto ela
          pulava o formulário inteiro, um voltar próprio era a única saída
          certa; agora as duas fariam a mesma coisa a 50px uma da outra. */}
      {children}
      <SheetChoices
        label={tr("Icon category")}
        value={atual.id}
        onPick={setAba}
        items={ICON_CATALOG.map((c) => ({
          id: c.id,
          // O nome da categoria mora em iconCatalog.ts; a tradução sai aqui,
          // na hora de desenhar.
          label: tr(c.label),
          icon: c.icon,
          count: c.icons.length,
        }))}
      />
      <div className="corvus-icongrid" role="group" aria-label={tr(atual.label)}>
        {atual.icons.map((ic) => (
          <IconTile
            key={ic}
            icon={ic}
            on={ic === value}
            tint={tint}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * As cores, em azulejos da forma da casa — os mesmos 44px dos ícones logo
 * abaixo. Eram bolinhas de 30px: forma que o app não usa em lugar nenhum e
 * alvo menor que o mínimo de toque, então escolher uma cor era mira.
 *
 * A marcada ganha um ANEL, não um check: o check taparia justamente a cor que
 * se está escolhendo. E o anel é feito do jeito que a forma exige — pai
 * mascarado com padding e a cor do anel no fundo, filho mascarado por cima
 * (docs/SQUIRCLE.md, "O padrão de anel"): `box-shadow` não serve, a máscara
 * apaga tudo que é desenhado fora da caixa.
 */
export function SheetSwatches({
  colors,
  value,
  onPick,
  resolve,
}: {
  colors: readonly string[];
  value: string;
  onPick: (color: string) => void;
  /** Traduz o id da cor pra um valor CSS ("default" → cor do tema). */
  resolve: (color: string) => string;
}) {
  return (
    <div className="corvus-swatches" role="group" aria-label={tr("Color")}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={c === value ? "corvus-swatch is-on" : "corvus-swatch"}
          aria-label={c}
          aria-pressed={c === value}
          onClick={() => onPick(c)}
        >
          <span
            className="corvus-swatch-fill"
            style={{ backgroundColor: resolve(c) }}
          />
        </button>
      ))}
    </div>
  );
}

/**
 * O botão que conclui, grudado no fim do conteúdo da folha.
 *
 * Ele NUNCA fica desligado por falta de preenchimento: botão apagado não diz
 * o que falta, e quem chegou até o fim da folha merece uma frase em vez de um
 * botão morto. O que falta vira `problema` — a folha explica e não grava.
 */
export function SheetSubmit({
  label,
  icon = "check",
  problema,
  onSubmit,
}: {
  label: string;
  icon?: string;
  /** O que impede de salvar agora; null = pronto. */
  problema?: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="corvus-form-foot">
      {problema && (
        <p className="corvus-form-problem" role="status">
          <Icon name="info" size={15} />
          <span>{problema}</span>
        </p>
      )}
      <button
        type="button"
        className="corvus-form-submit"
        aria-disabled={!!problema}
        onClick={onSubmit}
      >
        <Icon name={icon} size={18} />
        <span>{label}</span>
      </button>
    </div>
  );
}

/**
 * A fita de progresso de um wizard — vai no TOPO da folha (prop `progress` do
 * Sheet), logo abaixo do título.
 *
 * Ela já foi uma fileira de pontos no pé, junto dos botões, e estava no lugar
 * errado por dois motivos. Um: progresso é o ENDEREÇO da tela, e endereço se
 * lê junto do título — "New skill · Color" e a fita respondem à mesma pergunta,
 * e ela se faz antes de olhar o campo, não depois. Dois: com o teclado aberto,
 * que é o estado normal de um formulário no celular, o pé é a única faixa que
 * sobra, e ali cada milímetro é do botão.
 *
 * É um traço CONTÍNUO, sem divisões. Ela já foi segmentada, com cada pedaço
 * sendo um botão que pulava pro passo — e a conta que eu fiz ali estava
 * invertida: contar passos é trabalho de quem projeta a fila, não de quem a
 * atravessa. Quem está preenchendo quer saber se falta muito, e isso um traço
 * que anda responde sem pedir que ninguém conte nada. Voltar continua existindo
 * onde sempre esteve, no `‹ Back` do pé.
 *
 * Contínuo também é o que aguenta a fila mudar de tamanho: seis divisões
 * viravam sete, e a fita mudava de desenho por causa de um campo novo. A
 * largura não muda de desenho nunca.
 */
export function SheetProgress({
  atual,
  total,
}: {
  /** Índice do passo atual. */
  atual: number;
  /** Quantos passos a fila tem. */
  total: number;
}) {
  // Chegar num passo já CONTA: no primeiro a fita mostra um sexto, não zero —
  // zero diria que nada aconteceu, e abrir o formulário é a primeira coisa que
  // aconteceu. No último ela enche, antes de concluir, porque não há mais
  // tela pela frente.
  const passos = Math.max(total, 1);
  const feito = Math.min(Math.max(atual + 1, 1), passos);
  return (
    <div
      className="corvus-wiz-bar"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={passos}
      aria-valuenow={feito}
      aria-label={tr("Step {n} of {total}", { n: feito, total: passos })}
    >
      <span
        className="corvus-wiz-fill"
        style={{ width: `${(feito / passos) * 100}%` }}
      />
    </div>
  );
}

/**
 * O pé de um WIZARD: o que falta e para onde ir.
 *
 * Onde você ESTÁ não é assunto daqui — é da fita lá em cima (SheetProgress).
 * Aqui embaixo fica só o que falta e para onde ir.
 *
 * VOLTAR também não é daqui. Ele já existe: é a seta da barra de cima, que é
 * onde se procura por ele em qualquer tela do app. Este pé chegou a ter um
 * `‹ Back` ao lado do "Next" enquanto aquela seta saía do formulário — dois
 * voltares na mesma tela querendo dizer coisas diferentes, que é exatamente a
 * armadilha que o comentário aqui avisava. Hoje quem anda pra trás é a seta
 * (ver `voltar` em wizard.ts), e aqui embaixo só se anda pra frente.
 *
 * Sobram duas coisas, nesta ordem de leitura:
 *
 * 1. A linha de STATUS, que tem dois estados que nunca coexistem: o que falta
 *    pra salvar, ou — quando já não falta nada e ainda há passos à frente — o
 *    atalho de terminar agora. São a mesma pergunta ("posso acabar?") com as
 *    duas respostas possíveis, então dividem o mesmo lugar.
 * 2. O BOTÃO, que ocupa a largura inteira: avança a fila, ou conclui.
 */
export function SheetWizardFoot({
  atual,
  total,
  onPasso,
  problema,
  label,
  onSubmit,
}: {
  atual: number;
  /** Quantos passos a fila tem. Aqui basta o NÚMERO: os rótulos são da fita,
   *  que é quem nomeia cada passo. */
  total: number;
  onPasso: (i: number) => void;
  /** O que impede de salvar agora; null = pronto. */
  problema?: string | null;
  /** O texto do botão que CONCLUI ("Create skill"). */
  label: string;
  onSubmit: () => void;
}) {
  // Quais botões existem e o que a linha de status diz — ver wizard.ts, onde
  // essa meia dúzia de ternários é uma função pura com testes.
  const pe = peDoWizard({ atual, total, problema });
  return (
    <div className="corvus-form-foot">
      {pe.status === "problema" ? (
        /* O que falta só aparece no ÚLTIMO passo, que é onde mora o botão de
           concluir. "Give it a name." na tela do prompt seria um aviso sobre
           uma pergunta que ainda não foi feita — a pessoa leria como erro do
           que ela acabou de escrever. */
        <p className="corvus-form-problem" role="status">
          <Icon name="info" size={15} />
          <span>{problema}</span>
        </p>
      ) : pe.status === "atalho" ? (
        /* Já dá pra salvar e ainda sobram passos: o resto é enfeite, e ninguém
           deve tocar "Next" três vezes pra sair de uma coisa que já está
           pronta. É o caso de quem pediu ajuda à assistente no primeiro passo
           e recebeu o skill inteiro preenchido de uma vez. */
        <button type="button" className="corvus-wiz-now" onClick={onSubmit}>
          <Icon name="check" size={15} />
          <span>{tr("{label} now", { label })}</span>
        </button>
      ) : null}

      <button
        type="button"
        className="corvus-form-submit"
        aria-disabled={pe.primario === "submit" ? !pe.pronto : undefined}
        onClick={() =>
          pe.primario === "submit" ? onSubmit() : onPasso(atual + 1)
        }
      >
        {pe.primario === "submit" ? (
          <>
            <Icon name="check" size={18} />
            <span>{label}</span>
          </>
        ) : (
          <>
            <span>{tr("Next")}</span>
            <Icon name="chevron-right" size={18} />
          </>
        )}
      </button>
    </div>
  );
}

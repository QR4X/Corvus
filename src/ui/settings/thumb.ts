// src/ui/settings/thumb.ts
// O thumb dos segmented das settings (abas, providers, filtro do catálogo).
//
// As colunas são do tamanho do CONTEÚDO, então o thumb segue o item ativo por
// MEDIDA, em duas variáveis no próprio trilho (`--corvus-seg-x`/`-w`). O CSS
// tem um padrão pra elas — o primeiro item, largura zero — e uma transição.
// Daí as duas regras daqui:
//   - numa linha recém-criada, a primeira posição é instantânea: deslizar do
//     padrão era "ir pro primeiro e depois pro escolhido";
//   - uma linha REMONTADA (o filtro do catálogo, a cada toque) nasce com o
//     thumb onde o da velha estava, e desliza de lá.

export interface Thumb {
  x: string;
  w: string;
}

/** Onde o thumb desta linha está agora (`x === ""`: nunca foi posicionado). */
export function thumbOf(row: HTMLElement): Thumb {
  return {
    x: row.style.getPropertyValue("--corvus-seg-x"),
    w: row.style.getPropertyValue("--corvus-seg-w"),
  };
}

/** A linha nova começa com o thumb onde estava o da que ela substitui. */
export function seedThumb(row: HTMLElement, t: Thumb | null | undefined): void {
  if (!t?.x) return;
  row.style.setProperty("--corvus-seg-x", t.x);
  row.style.setProperty("--corvus-seg-w", t.w);
}

/** Põe o thumb sobre o item ativo — deslizando, se ele já estava em algum lugar. */
export function putThumb(row: HTMLElement): void {
  const active = row.querySelector<HTMLElement>(".corvus-seg-item.is-active");
  // Escondida (a linha é de outra aba), ela mede zero: posicionar agora
  // mandaria o thumb pro canto, e ele deslizaria de lá quando a aba abrisse.
  if (!active || active.offsetWidth === 0) return;
  const primeira = thumbOf(row).x === "";
  if (primeira) row.addClass("is-placing");
  row.style.setProperty("--corvus-seg-x", `${active.offsetLeft}px`);
  row.style.setProperty("--corvus-seg-w", `${active.offsetWidth}px`);
  if (primeira) {
    // Ler a medida fecha o estilo COM a transição desligada; só então ela
    // volta, e daí em diante o thumb desliza.
    void row.offsetWidth;
    row.removeClass("is-placing");
  }
}

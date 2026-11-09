export type PedidoDoEditor =

  | { tipo: "nota"; path: string; enviar?: string }

  | { tipo: "trecho"; path: string; texto: string };

type Ouvinte = (p: PedidoDoEditor) => void;

let ouvinte: Ouvinte | null = null;
const fila: PedidoDoEditor[] = [];

export function pedirAoPainel(p: PedidoDoEditor): void {
  if (ouvinte) ouvinte(p);
  else fila.push(p);
}

export function ouvirPedidos(fn: Ouvinte): () => void {
  ouvinte = fn;
  while (fila.length > 0) fn(fila.shift() as PedidoDoEditor);
  return () => {
    if (ouvinte === fn) ouvinte = null;
  };
}

export function esquecerPedidos(): void {
  ouvinte = null;
  fila.length = 0;
}

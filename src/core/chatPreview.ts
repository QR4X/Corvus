const TETO = 240;

export function previewFromMarkdown(content: string): string {
  const secoes = content.split(/^## (?:You|Assistant)\s*$/m);

  if (secoes.length < 2) return "";
  for (let i = secoes.length - 1; i >= 1; i--) {
    const texto = previewFromText(secoes[i]);
    if (texto) return texto;
  }
  return "";
}

export function previewFromText(bruto: string): string {
  return limpar(bruto).slice(0, TETO);
}

const MARCA = String.fromCharCode(0xe000);
const GUARDADO = new RegExp(`${MARCA}(\\d+)${MARCA}`, "g");

function limpar(bruto: string): string {

  const codigos: string[] = [];
  const guardar = (_: string, c: string) => `${MARCA}${codigos.push(c) - 1}${MARCA}`;
  const texto = bruto

    .replace(/<!--[\s\S]*?-->/g, " ")

    .replace(/^```.*$/gm, " ")

    .replace(/^\s{0,3}(?:[#>]+|[-*+]|\d+\.)\s+/gm, " ")
    .replace(/`([^`\n]+)`/g, guardar)

    .replace(/\\([\\`*_{}[\]()#+\-.!~=|>])/g, guardar)

    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/!\[\[[^\]]*\]\]/g, " ")

    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, (_, alvo: string) => alvo.replace(/#\^?/g, " > "))

    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")

    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "$1")
    .replace(/(^|[^\w])__(?=\S)([^_\n]*?\S)__(?!\w)/g, "$1$2")
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?[^\s*])\*(?![\w*])/g, "$1$2")
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?[^\s_])_(?!\w)/g, "$1$2")
    .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "$1")
    .replace(/==(?=\S)([^=\n]*?\S)==/g, "$1")

    .replace(/<\/?[a-zA-Z][^<>]*>/g, " ")
    .replace(GUARDADO, (_, i: string) => codigos[Number(i)] ?? "");
  return texto.replace(/\s+/g, " ").trim();
}

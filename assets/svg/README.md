# SVG source assets

Arquivos SVG crus usados na UI do Corvus. São **fonte**: o
`scripts/genLogos.mjs` os embute no `main.js` no build (o plugin distribui só
`main.js` + `manifest.json` + `styles.css`).

A PASTA não é distribuída — o CONTEÚDO dela é, inline. Por isso os logos dos
providers, que vêm do [lobe-icons](https://github.com/lobehub/lobe-icons) (MIT),
estão creditados no [NOTICE.md](../../NOTICE.md) da raiz: a licença MIT exige que
o aviso acompanhe a distribuição, e a distribuição é o `main.js`.

Fluxo: solte os `.svg` aqui → eu registro via `addIcon()` em
`src/components/_shared/` (mono) ou inline como componente/CSS (colorido) →
usado pelo `<Icon name="..." />`.

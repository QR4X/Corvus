# SVG source assets

Raw SVG files used in the Corvus UI. These are source assets:
`scripts/genLogos.mjs` embeds them into `main.js` during the build (the plugin
distributes only `main.js`, `manifest.json` and `styles.css`).

The folder itself is not distributed, but its content is inlined. Therefore,
the provider logos from [lobe-icons](https://github.com/lobehub/lobe-icons) (MIT)
are credited in [NOTICE.md](../../NOTICE.md) at the repository root.

Workflow: drop `.svg` files here, register them via `addIcon()` in
`src/ui/brandLogos.ts`, and render them with `<Icon name="..." />`.

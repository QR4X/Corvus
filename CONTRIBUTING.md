# Contributing to Corvus

Thanks for looking. Corvus is maintained by QR4X. Bug reports, reproductions
and focused pull requests are welcome.

## Reporting a bug

Open an [issue](https://github.com/QR4X/M.I.L.A/issues) with:

- your Obsidian version, platform (desktop / iOS / Android) and the plugin version;
- the provider and model you were using, if the bug involves a conversation;
- what you did, what you expected, and what happened instead.

**Never paste an API key**, a conversation you don't want public, or the contents of
your `data.json`. Keys live in your OS keychain and are not needed to reproduce a bug.

## Setting up

```bash
npm install --legacy-peer-deps   # obsidian × codemirror have a peer-dependency conflict
npm run build                    # typecheck + production bundle into output/
npm test                         # vitest
npm run lint                     # the same eslint-plugin-obsidianmd the community review runs
```

`npm run preview` serves the UI against Obsidian's **real** `app.css`, extracted from
your local Obsidian install. Use it for any visual change: Obsidian's stylesheet
outranks a bare plugin class, so a change that looks right in isolation can lose to it
inside the app.

## Ground rules

- **The review's Errors block a release.** Run `npm run lint` before opening a PR; it
  must report 0 errors. Every warning that stays open is justified in
  `eslint.config.mjs` or at the top of `styles/main.css` — read those before "fixing" one.
- **Selectors for our own UI start with `.corvus-root`.** Obsidian's `app.css` styles
  bare elements with selectors worth `(0,1,1)`; a single plugin class (`0,1,0`) loses
  to them. The exceptions are the rules that must reach Obsidian's own elements (the
  mobile drawer, the leaf, the modal container) — they live in the block at the top
  of `styles/main.css`, and that file's header explains each one.
- **Be careful with the mobile keyboard / fullscreen block** at the top of
  `styles/main.css`. Its behaviour comes from a version verified on real phones, and
  `tests/keyboardLayout.test.ts` guards it. Any change there has to be shown to compute
  the same values (the header describes how that was done for the last changes). If
  you believe something there is wrong, open an issue with a device, an Obsidian
  version and a screenshot first.
- **The agent may only touch the vault through the Obsidian API**, and never inside a
  hidden folder (see `normalizePath` in `src/agent/tools.ts`). Keep it that way.
- **Network:** model and API calls live in `src/providers/`, embeddings in `src/rag/`.
  They use Obsidian's `requestUrl`; the only `fetch` in the plugin (called as `window.fetch`, the same
  function — see the note there and the README's Disclosures) is `fetchStream` in
  `src/providers/_shared.ts`, because streaming needs it (NVIDIA NIM streams through
  Node's `https` on desktop instead). Prefer adding to those
  layers over new network calls from UI code.
- **UI text is English.** There is an i18n layer in `src/i18n/` (with a pt-BR locale),
  but most UI strings are still written inline — moving them there is welcome. Code
  comments are in Portuguese; that is fine to keep.
- Keep the bundle small. `npm run build` prints `main.js` and `styles.css` sizes against
  their budgets; a PR that grows them should say why.

## Pull requests

- One change per PR, with a description of the problem it solves and how you tested it
  (unit tests, `npm run preview`, or a device).
- Add or update tests when you change behaviour.
- Releases are cut by the maintainer: the version is bumped in `manifest.json`,
  `package.json` and `versions.json`, the tag is pushed first, and `main` only after the
  GitHub Release exists (see the header of `.github/workflows/release.yml`).
- Test builds don't bump anything: a tag with a hyphen (e.g. `0.9.20-beta.1`, higher than
  the current stable) publishes a GitHub **pre-release** whose bundled `manifest.json`
  carries that version. Testers get it through [BRAT](https://github.com/TfTHacker/obsidian42-brat);
  the Obsidian directory keeps serving the stable version from `main`'s `manifest.json`.
  Changes accumulate on `main` and ship together in the next stable release.
- Cadence: every **3** modifications get a test build, and **10** since the last stable
  get a release. A modification is a `fix`, `feat` or `perf` commit; `npm run lote` counts
  them and prints the next tag. Test builds need the tests and the build (the tag's
  workflow runs both); the full lint pass — `npm run lint`, the `strict` type-check mirror
  and the CSS stylelint — runs before a release.

## License

Corvus is licensed under [GPL-3.0-or-later](LICENSE). By submitting a contribution
you agree that it is licensed under the same terms.

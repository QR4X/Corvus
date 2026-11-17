# Scripts

Generators and developer utilities. Files matching `*.generated.ts` are
auto-generated — do not edit them by hand; run the corresponding script instead.

| Script | Generates | When to run |
|---|---|---|
| `genLogos.mjs` | `src/ui/brandLogos.ts` | when adding or replacing SVGs in `assets/svg/` |
| `deploy.mjs` | copies the build output into a test vault | manually during development |
| `batch.mjs` | counts modifications since the last beta and stable release | after each `fix`/`feat`/`perf` (`npm run batch`): 3 → beta, 10 → release |

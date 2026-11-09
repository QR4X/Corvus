# Scripts

Generators and developer utilities. Files matching `*.generated.ts` are
auto-generated — do not edit them by hand; run the corresponding script instead.

| Script | Generates | When to run |
|---|---|---|
| `genLogos.mjs` | `src/ui/brandLogos.ts` | when adding or replacing SVGs in `assets/svg/` |
| `collect-hot.mjs` | `src/providers/hotData.generated.ts` | weekly (model popularity) |
| `deploy.mjs` | copies the build output into a test vault | manually during development |
| `batch.mjs` | counts modifications since the last beta and stable release | after each `fix`/`feat`/`perf` (`npm run batch`): 3 → beta, 10 → release |

## Model popularity collection ("hot") — weekly automation

`collect-hot.mjs` fetches real popularity data and regenerates the table that
drives the model popularity score (`src/providers/dataCollect.ts`).

**Sources:**
- **Open models** → HuggingFace Hub API (`downloads` per organization). Public,
  stable, no API key required.
- **Closed models** (`gpt`/`claude`/`gemini`/…) → curated baseline inside the
  script (`CLOSED`), since no public usage API exists for them. Update `CLOSED`
  when flagship models change.

**Automation design:** the script is idempotent — identical input produces an
identical output file (no timestamp; git history is the record). If popularity
has not changed, there is no diff and no commit.

### Weekly run command

```bash
node scripts/collect-hot.mjs
git diff --quiet src/providers/hotData.generated.ts \
  || git commit -am "chore(data): weekly hot ranking update"
```

This runs via GitHub Actions (`schedule: cron "0 9 * * 4"` = Thursday 09:00 UTC)
or via `npm run collect:hot`.

> When adding a new model family, register its pattern in `HF_FAMILIES`
> (for open models, with its HuggingFace `org`) or in `CLOSED` (for closed models).

# AGENTS.md

Corvus is an Obsidian plugin (desktop and mobile) that
chats with the vault, answers questions about your notes, and lets an agent
edit notes. TypeScript, Preact, Zustand, six LLM providers, user-supplied keys.

## Commands

- Install: `npm install`
- Build (typecheck + bundle): `npm run build`
- Typecheck only: `npx tsc -noEmit -skipLibCheck`
- All tests: `npm test`
- One test file: `npx vitest run tests/<name>.test.ts`
- Watch tests: `npm run test:watch`
- Lint: `npm run lint`
- Bundle size report: `npm run size`
- Dev watch build: `npm run dev`

## Project map

| Path | Purpose |
| --- | --- |
| `src/main.ts` | Plugin entry: composition root, lifecycle, view + command wiring |
| `src/settings.ts` | `CorvusSettings` shape, `DEFAULT_SETTINGS`, secret fields |
| `src/settingsStore.ts` | Load (with legacy-field migration), backup, keychain secrets, save |
| `src/agent/` | Agent mode: tools, permissions, loop detection, undo |
| `src/assistant/` | Assistant mode: prompt, parsing, model helpers |
| `src/core/` | Domain logic: chat engine, sessions, chat library, vault paths/fs, provider table (`providersMeta`) |
| `src/rag/` | Retrieval: embeddings, indexer, hybrid search, vector index |
| `src/providers/` | LLM provider adapters (OpenAI, Anthropic, Gemini, OpenRouter, NIM, Ollama) |
| `src/store/` | Zustand stores (chat, settings state) |
| `src/ui/` | Views, modals, settings tab |
| `src/i18n/` | UI strings |
| `src/usage/` | Usage and cost tracking |
| `src/skills/` | Skill loading and execution |
| `src/editor/` | Obsidian editor commands |
| `tests/` | Vitest tests (flat folder); Obsidian stub in `tests/obsidian-stub.ts` |
| `scripts/` | Build, release, and preview helpers |
| `docs/` | Project documentation |

## Conventions

- TypeScript strict. Avoid `any`; prefer explicit types at boundaries.
- Keep files focused; prefer one responsibility per file.
- User-visible settings: add the field and default in `src/settings.ts`, the row
  in `src/ui/settings/tree.ts` (and `src/ui/settings/values.ts` if it is a plain
  bool/text/number control), and a test. Renaming or dropping a persisted field
  goes through `RENAMED_FIELDS` / `DEAD_FIELDS` in `src/core/legacySettings.ts`.
- Provider facts (credential field, model field, embeddings) live only in the
  `PROVIDERS` table in `src/core/providersMeta.ts`.
- Layering: `core/`, `agent/`, `rag/`, `usage/`, `providers/` never import `ui/`.
- No bare UI text; wrap it in `tr()` from `src/i18n/tr.ts` (shared strings live in `src/i18n/en-us.ts`).
- Do not add code comments; keep the repository 100% in English.
- Match the patterns of neighboring files before adding new abstractions.

## Testing

- Vitest. Test files live flat in `tests/`; test behavior, not source text.
- Run `npm test` before finishing; use a single-file run while iterating.
- Every new behavior ships with a test.

## Forbidden

- Do not edit build output (`main.js`, `output/`); it is generated.
- Do not bump `manifest.json` / `versions.json` by hand; the release workflow
  does it.
- Do not add dependencies without asking.
- Never commit secrets, tokens, or API keys.

## Gotchas

- The Obsidian API exists only at runtime; tests use `tests/obsidian-stub.ts`.
- Mobile builds are limited: guard platform-specific browser APIs.
- `npm run build` runs `tsc` first; a type error fails the build.

## PR / commit

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
- Before committing: `npm run build`, `npm test`, `npm run lint`.

## Pointers

- Architecture and decisions: `docs/` (`AGENT_CLOUD_PLAN.md`, `VALIDATION.md`, `archive/`).
- Retrieval design: `src/rag/`.
- Agent tools: `src/agent/`.

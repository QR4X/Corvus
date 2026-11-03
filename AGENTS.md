# AGENTS.md

M.I.L.A is a fork of AXXA Agent: an Obsidian plugin (desktop and mobile) that
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
| `src/main.ts` | Plugin entry, lifecycle (onload/onunload), view + command wiring |
| `src/agent/` | Agent mode: tools, permissions, loop detection, undo |
| `src/assistant/` | Assistant mode: prompt, parsing, model helpers |
| `src/core/` | Domain logic: chat engine, sessions, vault search, indexing |
| `src/rag/` | Retrieval: embeddings, indexer, hybrid search, vector index |
| `src/providers/` | LLM provider adapters (OpenAI, Anthropic, Gemini, OpenRouter, NIM, Ollama) |
| `src/store/` | Zustand stores (chat, settings state) |
| `src/ui/` | Views, modals, settings tab |
| `src/i18n/` | UI strings |
| `src/usage/` | Usage and cost tracking |
| `src/skills/` | Skill loading and execution |
| `src/editor/` | Obsidian editor commands |
| `tests/` | Vitest tests, mirrors `src/`; stubs in `tests/__stubs__` |
| `scripts/` | Build, release, and preview helpers |
| `docs/` | Project documentation |

## Conventions

- TypeScript strict. Avoid `any`; prefer explicit types at boundaries.
- Keep files focused; prefer one responsibility per file.
- User-visible settings: add a default in `src/ui/settings/values.ts`, the row
  in `src/ui/settings/tree.ts`, the label in `src/i18n/`, and a test.
- No hardcoded UI text; route through `src/i18n/`.
- Match the patterns of neighboring files before adding new abstractions.

## Testing

- Vitest. Test files live in `tests/` and mirror the `src/` layout.
- Run `npm test` before finishing; use a single-file run while iterating.
- Every new behavior ships with a test.

## Forbidden

- Do not edit build output (`main.js`, `output/`); it is generated.
- Do not bump `manifest.json` / `versions.json` by hand; the release workflow
  does it.
- Do not add dependencies without asking.
- Never commit secrets, tokens, or API keys.

## Gotchas

- The Obsidian API exists only at runtime; tests use the stubs in `tests/__stubs__`.
- Mobile builds are limited: guard platform-specific browser APIs.
- `npm run build` runs `tsc` first; a type error fails the build.

## PR / commit

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
- Before committing: `npm run build`, `npm test`, `npm run lint`.

## Pointers

- Architecture and decisions: `docs/` (`AGENT_CLOUD_PLAN.md`, `VALIDATION.md`, `archive/`).
- Retrieval design: `src/rag/`.
- Agent tools: `src/agent/`.

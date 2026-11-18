# Porting the pre-untangle PRs (#16 to #21)

Handover note. Records what was done on 2026-11-18 to bring the six open
pull requests, which were created before the large untangle session, into
the restructured main branch, then release them for BRAT.

## Context

The `main` branch was rebuilt in an untangle session: every source
identifier, CSS class and internal value was translated to English, the
plugin class was split into focused services, pure logic was moved out of
the UI layer, and the test suite was translated to test behavior instead
of source text.

The six open PRs dated 2026-11-12 (before that session) were based on the
old structure. A git-level rebase or merge would fail across renamed
files and symbols. Each change was therefore re-implemented on a clean
branch from `main`, one commit per PR, and merged as PR #23 (squash
commit `0e77353`).

## What landed and where the code lives now

| PR | CI: feature | New home |
| --- | --- | --- |
| #16 | Read the Screen Wake Lock from `navigator`, not `window` | `src/core/wakeLock.ts` (`browserEnv`) |
| #17 | Stop button reliably cancels running answers | `src/providers/abort.ts`, provider wrapper in `src/providers/index.ts`, agent retry loop in `src/core/agentTurn.ts` |
| #18 | Select and copy answer text on iOS | `styles/main.css` (user-select rules) |
| #20 | Switch model in a running chat | `src/core/session.ts` (`selectModel`, `syncLockedModel`), model sheet in `src/ui/ChatView.tsx` |
| #19 | Inline chronological thinking trace | `src/core/trace.ts`, `src/core/tracePersist.ts`, `src/core/deltaBatcher.ts`, `src/ui/ThinkingTrace.tsx`, `src/ui/ticker.ts` |
| #21 | Steer the agent with queued messages mid-turn | `drainQueued` in agent loop `src/core/agentTurn.ts`, `steersByResponse` in `src/agent/conversation.ts`, `restoreQueueToDraft` in `src/core/session.ts` |

The original feature branches were deleted and the original PRs were
closed as superseded by #23.

## Approach

Port, not merge. Each feature was re-applied to the current code and kept
consistent with the codebase's conventions.

Layering is respected: pure trace and persistence logic lives in
`src/core/`, the React components that consume it live in `src/ui/`.
The untangle moved `trace.ts` to `src/core/` (originally it was proposed
under `src/ui/`) so that `core/` never imports `ui/`.

Data model change from #19 + #21: reasoning is no longer buffered into
one string on the answer. Each reasoning segment is its own ordered
`ai-comment` with a `thought` field, steering messages are `ai-comment`s
with a `steer` field, and tool calls interleave with them. A hidden
`corvus-trace` comment persists them (capped at 20k chars) and is
stripped from exports. Old chats with buffered reasoning load unchanged.

Streaming deltas are coalesced per animation frame by
`src/core/deltaBatcher.ts`, and `src/ui/ticker.ts` shares one timer
across the trace elements.

## Verification

Ran on the final branch before the merge and again in CI during the
release:

- `npm test`: 121 files, 1389 tests passed
- `npm run lint`: 0 errors, 1 pre-existing warning in `SettingsTab.ts`
- `npm run build`: passed, bundle size report generated

## Release for BRAT

`Corvus` is an Obsidian plugin. BRAT installs a beta from a GitHub
prerelease. The repository `release.yml` workflow builds, tests, and
creates the release on a version tag.

For this iteration a prerelease was created for the freshly merged main:

- Version in `manifest.json` here is still `0.9.36`
- Tag: `0.9.37-beta.4` (higher than stable, so the workflow marks it as
  a prerelease and stamps the output `manifest.json` with the tag)
- Workflow run: success; assets published: `main.js`, `manifest.json`,
  `styles.css`

To release the next iteration for BRAT, tag the merged main with the next
prerelease, for example `0.9.37-beta.5`, and push it:

```bash
git tag -a "0.9.37-beta.5" -m "Corvus 0.9.37-beta.5 (test, for BRAT)"
git push origin "0.9.37-beta.5"
```

## Checklist for the reviewer

- Trace ordering: `tests/trace.test.ts` covers chronology and legacy
  fallback; `tests/tracePersist.test.ts` covers the markdown round trip.
- Stop behaviour: `tests/abortStream.test.ts` (abort helpers) and
  `tests/steerQueue.test.ts` (queue restored to draft).
- Model switch: `tests/modelSwitch.test.ts`.
- Wake lock: `tests/wakeLock.test.ts` adds the `browserEnv` navigator
  case.
- Selectable text: `tests/selectableText.test.ts` checks the CSS rules.
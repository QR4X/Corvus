# Corvus UI Redesign (v0.9.37)

Comprehensive overview and code review of the mobile-first UI overhaul completed across releases `0.9.37-beta.5` through `0.9.37-beta.10`.

---

## 1. Objectives and Scope

The goal was to transform Corvus from a dense, desktop-biased interface into a clean, lightweight, and fluid mobile-first Obsidian chat experience.

Key requirements addressed:
- In-chat mode switcher: Switch seamlessly between Direct Chat, Vault Q&A, and Agent modes without leaving the conversation.
- Dashboard decluttering: Eliminate redundant mode launcher cards and reduce visual noise.
- Clean starter screen: Remove artificial prompt suggestion chips.
- Simplified media attachment: Single image action (iOS/Android native picker handles camera vs. photo library).
- Unified context menu: Replace mismatched tiles and rows with a cohesive, fluid action sheet.
- Restored activity intelligence: Full month activity heatmap, top models, token volume, and cost tracking with responsive mobile stacking.

---

## 2. Implemented Changes and Commits

| Commit | Description | Scope |
| --- | --- | --- |
| `9ddef04` | Raise mobile tap targets and trim helper copy | Mobile touch areas (44px min), cleaner settings |
| `8a6da62` | Tighten settings and chat copy to cut text | Concise microcopy, eliminated redundant explanations |
| `22357e9` | Add in-chat mode switcher and streamline layout | Reactive mode pills in composer, state synchronization |
| `5eedf69` | Complete overhaul of dashboard and chat experience | Flat UI elevation cleanup, typography compliance |
| `6c6bfe1` | Streamline dashboard, context actions and usage activity | Removed duplicate mode cards, restored cost and heatmap |
| `2dfb75d` | Unify and polish context action sheet | Unified list hierarchy, 38px badge icons, fluid states |

---

## 3. Two-Stage Code Review

### Stage 1: Specification Compliance

1. **In-Chat Mode Switcher (`src/ui/ChatView.tsx`, `src/core/session.ts`)**
   - *Spec*: Allow switching between `chat`, `vault-qa`, and `agent` modes within an active conversation or fresh draft.
   - *Verdict*: Fully compliant. Calling `session.setMode(m)` immediately updates session capability, config, and Zustand store without resetting message history.

2. **Dashboard Simplification (`src/ui/Dashboard.tsx`)**
   - *Spec*: Remove redundant launcher cards while keeping quick entry to conversations.
   - *Verdict*: Fully compliant. The three oversized launcher cards (`.corvus-dash-cards`) were replaced with a sleek `New conversation` button and recent conversations segmented by mode.

3. **Starter Screen Noise Removal (`src/ui/StarterScreen.tsx`)**
   - *Spec*: Remove prompt suggestion chips.
   - *Verdict*: Fully compliant. Completely removed `PROMPT_SUGGESTIONS` and rendered only the brand icon, greeting, tagline, and optional missing-key notice.

4. **Add Context Menu Polish (`src/ui/ChatView.tsx`, `src/ui/Sheet.tsx`, `styles/main.css`)**
   - *Spec*: Remove camera tile, make menu cleaner, lighter, and smoother.
   - *Verdict*: Fully compliant. Removed separate camera input and replaced disjointed tiles with a unified `SheetGroup` of `SheetRow` items with 38px rounded badges, fluid hover/active transitions, and disabled states for unsupported models.

5. **Activity & Cost Card (`src/ui/UsageCard.tsx`, `styles/main.css`)**
   - *Spec*: Restore detailed month activity, money spent, and heatmap without squashing on mobile.
   - *Verdict*: Fully compliant. Renders formatted USD total, month heatmap, top models with progress bars, and streak/active metrics. Responsive `@media (max-width: 520px)` stacks models and stats vertically.

---

### Stage 2: Code Quality and Architecture

1. **Flat UI and Elevation Discipline (`tests/flatUi.test.ts`)**
   - All `box-shadow` definitions strictly follow the flat UI guidelines (no drop shadows; only `none`, `transparent`, `inset`, `0 0 0`, or elevation tokens). Passes all automated tests.

2. **Typography and Obsidian Theme Tokens (`tests/obsidianFonts.test.ts`)**
   - No hardcoded `px` or `rem` font sizes in any new or modified CSS rules. All typography references `--font-ui-medium`, `--font-ui-small`, `--font-ui-large`, or `--font-ui-smaller`.

3. **Internationalization (`src/i18n/tr.ts`)**
   - Zero bare UI strings. All user-facing labels and descriptions are wrapped in `tr(...)`.

4. **Layering Architecture**
   - Domain logic (`core/`, `usage/`, `rag/`) remains completely free of UI imports.
   - Reactive updates flow unidirectional through Zustand (`useChatStore`) and `ChatSession`.

5. **Test Coverage**
   - Full Vitest suite passes: 124 test files, 1391 tests passing, 0 failures.
   - Added `tests/modeSwitch.test.ts` covering runtime mode switching and persistence.

---

## 4. Verification and Release History

- `0.9.37-beta.7`: Initial in-chat mode switcher deployment.
- `0.9.37-beta.8`: Redesigned dashboard and composer integration.
- `0.9.37-beta.9`: Dashboard cleanup, prompt suggestions removal, restored usage activity.
- `0.9.37-beta.10`: Final context action sheet unification and visual polish.

All releases are tagged and published with automated build assets (`main.js`, `manifest.json`, `styles.css`) ready for installation via Obsidian BRAT.

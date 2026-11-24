# In-Chat Mode Switcher and UI Refinements

## Overview

Corvus consolidates the three operational modes directly into the chat composer and completely overhauls the Dashboard into a clean, modern, mobile-friendly interface:

1. **Chat**: Pure LLM reasoning with zero vault lookup overhead.
2. **Vault Q&A**: Grounds responses in user notes using semantic/keyword retrieval (RAG).
3. **Agent**: Operates with tool execution, autonomous note creation, editing, and approval diffs.

## Architecture & Implementation

### 1. Store & Session Synchronization
- `src/store/chat.ts`: Added `setSessionMode(mode: string)` to maintain synchronous reactive state across views and stores.
- `src/core/session.ts`: `setMode(mode: ChatMode)` allows switching modes at any time (both before and during active conversations). When changing mode for an existing saved chat, old persisted files are relocated to maintain file path integrity.

### 2. Composer Micro-Header & Chat Stream
- `src/ui/ChatView.tsx`: Integrated `.corvus-composer-mode` directly above the composer textarea. A tactile pill radio-group (`[Chat | Vault | Agent]`) allows one-tap switching per message.
- A dynamic tagline clarifies the active capability state ("Direct chat", "Reads vault", "Edits vault").
- Direct access to the slide-in drawer is provided via the topbar menu button on empty conversations.
- Empty states feature context-aware prompt suggestions (`StarterScreen.tsx`) tailored specifically to the active engine mode.

### 3. Redesigned Dashboard (Home View)
- `src/ui/Dashboard.tsx`: Removed the visual clutter of 105-cell unreadable calendars and redundant separator lines.
- Replaced by a welcoming header and 3 tactile Quick Launch cards (`Direct Chat`, `Vault Q&A`, `Agent`) positioned front and center.
- Recent conversations are cleanly displayed with mode icons, timestamps, and model tags.
- Replaced the bloated usage panel with a compact, responsive Activity Card (`src/ui/UsageCard.tsx`) displaying key metrics (tokens, streak, messages) and Vault index health, linking cleanly to full analytics.

### 4. Visual Restraint & Flat UI
- `styles/main.css`: Adheres strictly to the flat UI principles (`box-shadow: 0 0 0 1px var(--corvus-line)`).
- Fully responsive on mobile with clean breakpoints to prevent squished columns and layout overflow.

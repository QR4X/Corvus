# In-Chat Mode Switcher and UI Refinements

## Overview

Corvus consolidates the three operational modes directly into the chat composer rather than fragmenting them across disparate module screens:

1. **Chat**: Pure LLM reasoning with zero vault lookup overhead.
2. **Vault Q&A**: Grounds responses in user notes using semantic/keyword retrieval (RAG).
3. **Agent**: Operates with tool execution, autonomous note creation, editing, and approval diffs.

## Architecture & Implementation

### 1. Store & Session Synchronization
- `src/store/chat.ts`: Added `setSessionMode(mode: string)` to maintain synchronous reactive state across views and stores.
- `src/core/session.ts`: `setMode(mode: ChatMode)` allows switching modes at any time (both before and during active conversations). When changing mode for an existing saved chat, old persisted files are relocated to maintain file path integrity.

### 2. Composer Micro-Header
- `src/ui/ChatView.tsx`: Integrated `.corvus-composer-mode` directly above the composer textarea. A tactile pill radio-group (`[Chat | Vault | Agent]`) allows one-tap switching per message.
- A dynamic tagline clarifies the active capability state ("Direct chat", "Reads vault", "Edits vault").
- Direct access to the slide-in drawer is provided via the topbar menu button on empty conversations.

### 3. Visual Restraint & Flat UI
- `styles/main.css`: Adheres strictly to the flat UI principles (`box-shadow: 0 0 0 1px var(--corvus-line)`).
- `src/ui/StarterScreen.tsx`: Cleaned of redundant duplicate segmented bars to preserve typographic clarity and focus.

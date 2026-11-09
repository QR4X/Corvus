export const EN_US = {
  chat: {
    deletedToTrash: "Conversation moved to trash.",
  },

  conversations: {
    renameSuccess: (title: string) => `Renamed to "${title}".`,
    renameFailed: (msg: string) => `Failed to rename: ${msg}`,
  },

  agent: {
    loopAborted:
      "Agent kept repeating the same action and was stopped. Try rephrasing the task or giving more context.",
    thinking: "🤖 Agent thinking...",
    systemPrompt:
      "You are Corvus, an assistant integrated into Obsidian with direct access " +
      "to the user's vault via tools. Respond in English. " +
      "To FIND notes about a topic or question, use vault_search FIRST " +
      "(semantic search) instead of listing folders and reading file by file — it's " +
      "much more efficient. " +
      "Use the tools to accomplish the requested task — read, create, edit, move, or " +
      "delete files when the user asks. Ask FIRST if the intent is ambiguous. " +
      "When done, return a text response summarizing what you did. " +
      "To edit files, ALWAYS use vault_read first to see the exact content. " +
      "If a tool fails, ADJUST your strategy (wrong path? format? permission?) " +
      "before retrying — never repeat the EXACT same call that just failed. " +
      "When you need to list many files, prefer parallel tool calls (same turn).",
    needsOpenAI:
      "Agent Mode requires a provider with tool calling. Use OpenAI, Anthropic, Gemini, OpenRouter, Nvidia NIM, or Ollama (compatible model).",
    unknownTool: (name: string) => `Unknown tool: ${name}`,
    deniedTool: (name: string) => `Denied: ${name}`,
    loopDetectedPending: "Loop detected — asking the agent to reconsider",
    loopDetectedDone: "Loop detected — asked the agent to reconsider",
    confirmTitle: "Review Agent change",
    confirmTitleIrreversible: "⚠️ Delete this?",
    confirmTitleWeb: "Allow this web request?",
    confirmDeny: "Deny",
    confirmApproveAll: "Approve all",
    confirmApprove: "Approve",
    confirmDelete: "Yes, delete",
    confirmLabelEdit: "Edit",
    confirmLabelCreate: "Create",
    confirmLabelCreateFolder: "Create folder",
    confirmLabelFrom: "From",
    confirmLabelTo: "To",
    confirmLabelDelete: "Delete",
    confirmLabelWebSearch: "Search the web (Tavily)",
    confirmLabelWebFetch: "Open page",
    webPrompt:
      " You can also search the web (web_search) and open public pages (web_fetch) when the task needs outside or recent information: open the pages you rely on, and cite their URLs.",
    confirmTruncated: (n: number) => `+${n} chars not shown`,
  },

  vault: {
    searching: (topK: number, effort: string) =>
      `Searching up to ${topK} notes in vault (effort: ${effort})...`,
    searchDone: "Search complete",
    foundContextSemantic: (count: number) =>
      `${count} note${count !== 1 ? "s" : ""} found (semantic + keyword)`,
    foundContextKeyword: (count: number) =>
      `${count} note${count !== 1 ? "s" : ""} found (keyword — no semantic index)`,
    foundContextKeywordFallback: (count: number) =>
      `${count} note${count !== 1 ? "s" : ""} found (keyword — semantic search failed)`,
    notFound: "No relevant notes found — answering without vault context",
  },

  ai: {
    thinking: "Thinking...",
    emptyResponse:
      "The provider returned no answer, only reasoning or an empty response. Try again or choose another model.",
    outputLimit:
      "The model reached the request's output-token limit before finishing. Increase the output budget where supported, or try another model.",
    streamIncomplete:
      "The response stream ended before the provider confirmed completion. Try again.",
    invalidToolResponse:
      "The model returned incomplete or invalid tool arguments. No tools from this batch were executed.",
    recovering:
      "No usable answer received — trying once more (may use additional API credits).",
    errorPrefix: "[Error]",
    unknownError: "Unknown error.",
    failed: "Failed",
    interrupted: "Interrupted",
    err: {
      noKey: (provider: string) =>
        `No API key for ${provider}. Add your key in Settings to get started.`,
      noEndpoint: (provider: string) =>
        `No server address for ${provider}. Add it in Settings → Providers → ${provider} (usually http://localhost:11434).`,
      noModel: (provider: string) =>
        `No ${provider} model picked yet. In Settings → Providers → ${provider}, press Fetch models, then pick one.`,
      invalidKey: (provider: string) =>
        `Your ${provider} API key looks invalid or expired. Check it in Settings.`,
      rateLimit: "Rate limit reached. Wait a few seconds and try again.",
      network: "Connection failed. Check your internet and try again.",
      billing:
        "Gemini needs active API billing for this model. Your Google AI Pro/Ultra subscription does NOT cover the API — it's billed separately in AI Studio. Enable billing (Prepay plan, min $10) and try again.",
      contextOverflow:
        "This conversation no longer fits the model's context window. Start a new chat (this one stays saved), or delete some messages/attachments before retrying.",
    },
  },

  systemPrompt: {
    base:
      "You are Corvus, an assistant integrated into Obsidian. " +
      "Answer in English, clearly, directly, and helpfully. " +
      "Use Markdown when it makes sense.",
    vaultQaSuffix:
      "\n\nThe user is in Vault Q&A mode — below are relevant notes " +
      "extracted from their vault. Use them as the main source to answer. " +
      "ALWAYS cite the notes you used inline, in the [[Title]] format, using " +
      "EXACTLY the title shown in each block's ### header (the text inside " +
      "[[ ]]). Do not invent notes that are not listed below. When an answer " +
      "comes from a specific note, cite it right after the sentence.\n\nNotes:\n\n",
  },
};

export type Translations = typeof EN_US;

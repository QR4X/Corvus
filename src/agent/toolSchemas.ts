import type { ToolDefinition } from "./types";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "vault_search",
    description:
      "SEMANTIC relevance search across the vault notes (uses the embeddings index; falls back to keyword search when there is no index). USE THIS FIRST to find notes relevant to a topic or question — far more efficient than listing folders and reading files one by one. Returns the most relevant excerpts with each one's path (use vault_read to open the full file afterwards).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to look for — a topic, question or keywords.",
        },
        topK: {
          type: "number",
          description: "How many excerpts to return (1-20, default 5).",
        },
      },
      required: ["query"],
    },
    destructive: false,
  },
  {
    name: "vault_list",
    description:
      "Lists the files and folders inside a vault folder. Use it to discover what exists before creating/editing. No parameter = vault root.",
    parameters: {
      type: "object",
      properties: {
        folder: {
          type: "string",
          description:
            "Folder path (e.g. 'projects/2026'). Empty or absent = vault root.",
        },
      },
      required: [],
    },
    destructive: false,
  },
  {
    name: "vault_read",
    description:
      "Reads the full content of a vault file. Use it before editing to see what is there. Content is truncated at 200K chars when too large.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path in the vault (e.g. 'notes/agenda.md').",
        },
      },
      required: ["path"],
    },
    destructive: false,
  },
  {
    name: "vault_create",
    description:
      "Creates a new vault file with the given content. Fails if the file already exists (use vault_edit to modify). Creates folders along the path automatically when needed.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path of the new file. Include the extension (e.g. '.md' for notes).",
        },
        content: {
          type: "string",
          description: "File content (markdown, text, code, etc).",
        },
      },
      required: ["path", "content"],
    },
    destructive: true,
  },
  {
    name: "vault_edit",
    description:
      "Edits an existing file by replacing a specific string. Literal find/replace (no regex). old_str must appear EXACTLY once in the file — the tool fails on 0 or multiple matches. Use vault_read first to see the exact content.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path of the file to edit.",
        },
        oldStr: {
          type: "string",
          description:
            "LITERAL string to replace. Include enough context to make it unique in the file (3-5 lines if possible).",
        },
        newStr: {
          type: "string",
          description: "String that replaces the old one.",
        },
      },
      required: ["path", "oldStr", "newStr"],
    },
    destructive: true,
  },
  {
    name: "vault_move",
    description:
      "Renames or moves a file/folder. Fails if the destination already exists (never overwrites).",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Current path." },
        to: { type: "string", description: "New path." },
      },
      required: ["from", "to"],
    },
    destructive: true,
  },
  {
    name: "vault_delete",
    description:
      "Deletes a file or an EMPTY folder from the vault (it goes to the trash, following the user's Obsidian setting). The user is usually asked to confirm. For folders with content, delete the files first.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File/folder path." },
      },
      required: ["path"],
    },
    destructive: true,
    irreversible: true,
  },
  {
    name: "vault_create_folder",
    description:
      "Creates a vault folder (including parent folders when missing). No-op if the folder already exists.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path of the folder to create (e.g. 'projects/2026/q4').",
        },
      },
      required: ["path"],
    },
    destructive: true,
  },
  {
    name: "web_search",
    description:
      "Searches the web and returns the top results (title, URL and a short excerpt). Use it when the task needs information that is not in the vault or may have changed recently. Then open the most relevant results with web_fetch before relying on them, and cite the URLs in your answer. The user may be asked to confirm each search.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to search for, as you would type it in a search engine.",
        },
        maxResults: {
          type: "number",
          description: "How many results to return (1-10, default 5).",
        },
      },
      required: ["query"],
    },
    destructive: false,
    network: true,
  },
  {
    name: "web_fetch",
    description:
      "Opens a public web page and returns its readable text (up to about 20,000 characters), with the page title and URL. Use it to read a link the user gave you or a result from web_search. Only http(s) pages on the public internet; local addresses are refused. The user may be asked to confirm each page.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full page address, starting with https:// or http://.",
        },
      },
      required: ["url"],
    },
    destructive: false,
    network: true,
  },
  {
    name: "fetch_reel_transcript",
    description:
      "Fetches the transcript and caption of an Instagram Reel or video URL. Use this tool whenever the user provides an Instagram Reel link and asks to summarize, analyze, extract ideas, or work with its contents.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The full Instagram Reel or video URL (e.g. https://www.instagram.com/reel/C8xyz/).",
        },
      },
      required: ["url"],
    },
    destructive: false,
    network: true,
  },
  {
    name: "generate_image",
    description:
      "Generates an image from a text prompt and renders it in the conversation (saved in the vault). Use when the user asks for an image, illustration, mockup, logo, icon, cover, etc. The user confirms the model in a modal before generating — you do NOT choose the model. Write a rich, specific visual prompt. No need to switch the chat model.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Detailed visual description of the image (style, composition, colors, framing). English prompts usually render best.",
        },
      },
      required: ["prompt"],
    },
    destructive: false,
  },
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

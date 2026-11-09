import type {
  Setting,
  SettingDefinition,
  SettingDefinitionGroup,
  SettingDefinitionItem,
  SettingGroup,
  SettingGroupItem,
} from "obsidian";
import type { CorvusSettings } from "../../main";
import { PROVIDERS } from "../../core/providersMeta";
import {
  EFFORT_ICONS,
  EFFORT_LABELS,
  EFFORT_LEVELS,
  type EffortLevel,
} from "../../core/effort";
import { CHAT_MODES } from "../../core/session";
import { MODULES, STARTUP_DASHBOARD } from "../modules";
import { QUANT_ITENS } from "./searchIndex";
import { LOCALES } from "../../i18n";
import { mark, tr } from "../../i18n/tr";
import { PERMISSION_ICONS, PERMISSION_LABELS } from "../../agent/permissions";
import type { PermissionLevel } from "../../agent/types";
import { ELEVEN_MODELS } from "../../providers/elevenlabs";
import { prettyModelName } from "../../providers/modelDescriptions";
import { FREE_TOKENS_AS_OF } from "../../usage/freeTokens";
import { OPENAI_TTS_MODELS, OPENAI_VOICES, STT_MODELS } from "../readAloud";
import type { BoolKey, TextKey } from "./values";

export type TabId =
  | "providers"
  | "chat"
  | "vault"
  | "rag"
  | "agent"
  | "mobile";

export interface TabDef {
  id: TabId;
  label: string;

  blurb: string;
  mobileOnly?: boolean;
}

export const TABS: TabDef[] = [
  {
    id: "providers",
    label: mark("Providers"),
    blurb: mark("Your keys and the model each provider uses. Keys stay on this device."),
  },
  {
    id: "chat",
    label: mark("Chat"),
    blurb: mark("What every new conversation starts with."),
  },
  { id: "vault", label: mark("Vault"), blurb: mark("Where the plugin writes in your vault.") },
  {
    id: "rag",
    label: mark("Q&A"),
    blurb: mark("Vault Q&A: the local index that grounds answers in your notes."),
  },
  {
    id: "agent",
    label: mark("Agent"),
    blurb: mark("What the agent may do to your notes without asking."),
  },
  {
    id: "mobile",
    label: mark("Mobile"),
    blurb: mark("Options that only exist on the phone."),
    mobileOnly: true,
  },
];

export function tabsFor(isMobile: boolean): TabDef[] {
  return TABS.filter((t) => !t.mobileOnly || isMobile);
}

export type KeyField =
  | "openaiApiKey"
  | "anthropicApiKey"
  | "geminiApiKey"
  | "openrouterApiKey"
  | "nimApiKey";
export type ModelField =
  | "defaultModel"
  | "anthropicModel"
  | "geminiModel"
  | "openrouterModel"
  | "nimModel"
  | "ollamaModel";

export const PROVIDER_FIELDS: Record<string, { key?: KeyField; model: ModelField }> = {
  openai: { key: "openaiApiKey", model: "defaultModel" },
  anthropic: { key: "anthropicApiKey", model: "anthropicModel" },
  gemini: { key: "geminiApiKey", model: "geminiModel" },
  openrouter: { key: "openrouterApiKey", model: "openrouterModel" },
  nim: { key: "nimApiKey", model: "nimModel" },
  ollama: { model: "ollamaModel" },
};

export const SPEECH_LANGS: [string, string][] = [

  ["", mark("Auto (detect)")],
  ["pt", "Português"],
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["it", "Italiano"],
  ["ja", "日本語"],
];

export interface PickItem {
  value: string;
  label: string;
  icon?: string;

  glyph?: string;
}

const STT_ICONS: Record<string, string> = {
  "gpt-4o-mini-transcribe": "zap",
  "gpt-4o-transcribe": "sparkles",
  "whisper-1": "history",
};

const TTS_ICONS: Record<string, string> = {
  "gpt-4o-mini-tts": "sparkles",
  "tts-1-hd": "gem",
  "tts-1": "zap",
};

const ELEVEN_ICONS: Record<string, string> = {
  eleven_multilingual_v2: "sparkles",
  eleven_turbo_v2_5: "fast-forward",
  eleven_flash_v2_5: "zap",
};

export function nomeProprio(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type RowRender = (row: Setting, group: SettingGroup) => void | (() => void);

export interface Place {
  tab: TabId;
  provider?: string;
}

export interface SettingsUi {
  readonly isMobile: boolean;
  settings(): CorvusSettings;
  hasCredential(providerId: string): boolean;

  freeOfferCount(): number;
  nav: RowRender;
  rail: RowRender;

  credential(providerId: string): RowRender;
  connection(providerId: string): RowRender;
  newChatModel(providerId: string): RowRender;
  fetchModels(providerId: string): RowRender;
  catalog(providerId: string): RowRender;
  freeOffer: RowRender;

  pick(key: TextKey, items: () => PickItem[], tab: TabId): RowRender;

  effortLevel(level: EffortLevel): RowRender;
  assistantModel: RowRender;
  ttsProvider: RowRender;
  elevenKey: RowRender;
  tavilyKey: RowRender;
  spendLimit: RowRender;
  elevenFetch: RowRender;
  elevenVoice: RowRender;
  testVoice: RowRender;
  embeddingModel: RowRender;
  index: RowRender;
  hint(text: string): RowRender;
}

export interface SettingsTree {
  items: SettingDefinitionItem[];

  places: WeakMap<object, Place>;
}

interface RowExtras {
  visible?: () => boolean;
  searchable?: boolean;
  aliases?: string[];
}

const KEY_ALIASES = ["key", "token", "credential"];

function shownAs(name: string, render: RowRender): RowRender {
  return (row, group) => {
    row.setName(name);
    return render(row, group);
  };
}

function toggle(
  name: string,
  desc: string,
  key: BoolKey,
  more: RowExtras = {}
): SettingDefinition {
  return { name, desc, control: { type: "toggle", key }, ...more };
}

function text(
  name: string,
  desc: string,
  key: TextKey,
  more: RowExtras = {}
): SettingDefinition {
  return { name, desc, control: { type: "text", key }, ...more };
}

function custom(
  name: string,
  shown: string | null,
  desc: string,
  render: RowRender,
  more: RowExtras = {}
): SettingDefinition {
  return {
    name,
    ...(desc ? { desc } : {}),
    render: shown ? shownAs(shown, render) : render,
    ...more,
  };
}

function guarded(render: RowRender): RowRender {
  return (row, group) => {
    try {
      return render(row, group);
    } catch (err) {
      console.error("[corvus] settings: a row failed to draw", err);
      row.setDesc(tr("This setting failed to draw — see the developer console."));
    }
  };
}

function hintRow(render: RowRender, visible?: () => boolean): SettingDefinition {
  return { name: "", render, searchable: false, ...(visible ? { visible } : {}) };
}

export function buildSettingsTree(ui: SettingsUi): SettingsTree {
  const items: SettingDefinitionItem[] = [];
  const places = new WeakMap<object, Place>();
  const s = () => ui.settings();

  function group(
    place: Place | null,
    opts: { heading?: string; cls?: string },
    rows: SettingGroupItem[]
  ): void {
    const cls = [
      "corvus-set-group",
      place ? `corvus-set-tab-${place.tab}` : "",
      place?.provider ? `corvus-set-prov-${place.provider}` : "",
      opts.cls ?? "",
    ]
      .filter(Boolean)
      .join(" ");
    for (const r of rows) {
      const withRender = r as { render?: RowRender };
      if (withRender.render) withRender.render = guarded(withRender.render);
    }
    const g: SettingDefinitionGroup = { type: "group", cls, items: rows };
    if (opts.heading) g.heading = opts.heading;
    if (place) {
      places.set(g, place);
      for (const r of rows) places.set(r, place);
    }
    items.push(g);
  }

  function escolha(
    at: Place,
    name: string,
    shown: string | null,
    desc: string,
    key: TextKey,
    itens: () => PickItem[],
    more: RowExtras = {}
  ): SettingDefinition {
    return custom(name, shown, desc, ui.pick(key, itens, at.tab), more);
  }

  group(null, { cls: "corvus-set-flat corvus-set-navgroup" }, [
    { name: "", render: ui.nav, searchable: false },
  ]);

  group({ tab: "providers" }, { cls: "corvus-set-flat corvus-set-railgroup" }, [
    { name: "", render: ui.rail, searchable: false },
  ]);

  for (const p of PROVIDERS) {
    const f = PROVIDER_FIELDS[p.id];
    if (!f) continue;
    const at: Place = { tab: "providers", provider: p.id };

    group(at, { heading: p.name }, [
      f.key
        ? custom(
            tr("{provider} API key", { provider: p.name }),
            tr("API key"),
            tr("Stored in the OS keychain (not in data.json)."),
            ui.credential(p.id),
            { aliases: KEY_ALIASES }
          )
        : custom(
            tr("{provider} endpoint", { provider: p.name }),
            tr("Endpoint"),
            tr("Local server address. Ollama needs no key."),
            ui.credential(p.id),
            { aliases: ["url", "server", "address"] }
          ),
      custom(
        tr("{provider} connection", { provider: p.name }),
        tr("Connection"),
        "",
        ui.connection(p.id),
        { aliases: ["test", "connection"] }
      ),
      custom(
        tr("{provider} model for new chats", { provider: p.name }),
        tr("Model for new chats"),
        tr("Used when this provider is selected and nothing else was picked."),
        ui.newChatModel(p.id),
        { aliases: ["model", "default model"] }
      ),
    ]);

    if (p.id === "openai") {
      group(at, { heading: tr("Free daily tokens") }, [
        toggle(
          tr("I share API data with OpenAI"),
          tr(
            "Their switch, in Data controls on platform.openai.com. Turning it on there gives your account a daily quota at no cost; telling us here is what makes this list show the real numbers."
          ),
          "openaiDataSharing",

          { aliases: ["free", "quota", "data controls", "tier"] }
        ),

        escolha(
          at,
          tr("Usage tier"),
          null,
          tr(
            "Tiers 1–2 get 250k tokens/day on the big models and 2.5M/day on mini and nano. Tier 3 and up get 1M and 10M."
          ),
          "openaiTier",

          () =>
            [1, 2, 3, 4, 5].map((n) => ({
              value: String(n),
              label:
                n <= 2
                  ? tr("Tier {n} — 250k / 2.5M a day", { n })
                  : tr("Tier {n} — 1M / 10M a day", { n }),
              glyph: String(n),
            })),
          {
            visible: () => s().openaiDataSharing === true,
            aliases: ["tier", "quota"],
          }
        ),
        hintRow(
          ui.freeOffer,
          () => !s().openaiDataSharing && ui.freeOfferCount() > 0
        ),
        hintRow(
          ui.hint(
            tr(
              "The quota counts ALL your OpenAI API use, not just this vault — so anything the app says you have left is optimistic. Image models are never covered. Program terms as of {date}.",
              { date: FREE_TOKENS_AS_OF }
            )
          )
        ),
      ]);
    }

    group(at, {}, [
      custom(
        tr("{provider} models", { provider: p.name }),
        tr("Models"),
        tr("Fetch what this provider offers today, then choose what shows up where."),
        ui.fetchModels(p.id),
        { aliases: ["models", "catalog", "favorites"] }
      ),
      { name: "", render: ui.catalog(p.id), searchable: false },
    ]);
  }

  const chat: Place = { tab: "chat" };

  group(chat, {}, [
    escolha(
      chat,
      tr("Provider"),
      null,
      tr("Which provider a new chat opens with."),
      "defaultProvider",
      () => PROVIDERS.map((p) => ({ value: p.id, label: p.name, icon: p.icon })),
      { aliases: ["default provider"] }
    ),
    escolha(
      chat,
      tr("Mode"),
      null,
      tr("Chat, Vault Q&A or Agent. Locks on the first message."),
      "defaultMode",
      () =>
        CHAT_MODES.map((m) => ({
          value: m,
          label: tr(MODULES[m].label),
          icon: MODULES[m].icon,
        })),
      { aliases: ["mode"] }
    ),
    escolha(
      chat,
      tr("Open on startup"),
      null,
      tr(
        "What opens when Corvus starts: a fresh chat of this mode, or its dashboard. \"Off\" keeps Corvus closed — Obsidian opens your notes as usual."
      ),
      "startupChatMode",
      () => [
        { value: "", label: tr("Off"), icon: "power" },
        {
          value: STARTUP_DASHBOARD,
          label: tr("Dashboard"),
          icon: "layout-dashboard",
        },
        ...CHAT_MODES.map((m) => ({
          value: m,
          label: tr(MODULES[m].label),
          icon: MODULES[m].icon,
        })),
      ],
      {
        aliases: [
          "startup",
          "start",
          "boot",
          "on open",
          "dashboard",
        ],
      }
    ),
    escolha(
      chat,
      tr("Effort"),
      null,
      tr("How hard the model works: length, temperature."),
      "defaultEffort",
      () =>
        EFFORT_LEVELS.map((l) => ({
          value: l,
          label: tr(EFFORT_LABELS[l]),
          icon: EFFORT_ICONS[l],
        })),
      { aliases: ["effort", "reasoning"] }
    ),
    escolha(
      chat,
      tr("Language"),
      null,
      tr(
        "Interface, chat errors — and the language the model answers in. The creation assistant follows it too. \"Same as Obsidian\" follows the language Obsidian is set to. A few things, like command names, only switch after you reload Obsidian."
      ),
      "language",
      () =>
        LOCALES.map((l) =>

          l.id === "auto"
            ? { value: l.id, label: tr(l.label), icon: "languages" }
            : { value: l.id, label: l.label, glyph: l.id.slice(0, 2).toUpperCase() }
        ),
      { aliases: ["language", "locale", "english"] }
    ),
  ]);

  group(
    chat,
    { heading: tr("Effort levels") },
    EFFORT_LEVELS.map((l) =>
      custom(
        tr("{level} effort level", { level: tr(EFFORT_LABELS[l]) }),
        tr(EFFORT_LABELS[l]),
        "",
        ui.effortLevel(l),
        {
          aliases: [
            "effort",
            "tokens",
            "temperature",
            "agent",
          ],
        }
      )
    )
  );

  group(chat, { heading: tr("Daily spending") }, [
    custom(
      tr("Daily limit"),
      null,
      tr(
        "In dollars, for paid models, counted from public token prices. You get a heads-up at 80% and at 100%. Empty means no limit."
      ),
      ui.spendLimit,
      { aliases: ["budget", "limit", "spending", "cost"] }
    ),
    toggle(
      tr("Stop paid models at the limit"),
      tr(
        "When today's spending reaches the limit, paid models pause until midnight. Free and local models keep working, and so do models without a public price."
      ),
      "travarNoLimite",
      { aliases: ["budget", "limit", "pause", "block"] }
    ),
  ]);

  group(chat, { heading: tr("Assistant") }, [
    custom(tr("Assistant model"), tr("Model"), "", ui.assistantModel, {
      aliases: ["model", "assistant", "skills", "projects"],
    }),
    toggle(
      tr("Let it see your note names"),
      tr(
        "So it can suggest which notes to attach to a project. Only the paths are sent — never what is inside them. Off by default."
      ),
      "assistantSeesVault",
      { aliases: ["notes", "privacy"] }
    ),
  ]);

  const voiceOn = () => s().voiceEnabled;
  const ttsOn = () => s().ttsEnabled;

  const openaiReads = () => s().ttsEnabled && s().ttsProvider !== "eleven";
  const elevenReads = () => s().ttsEnabled && s().ttsProvider === "eleven";

  group(chat, { heading: tr("Voice") }, [
    toggle(
      tr("Talk instead of typing"),
      tr(
        "Puts a microphone in the composer: you speak, the words land in the box, and you send when you are happy with them."
      ),
      "voiceEnabled",

      {
        aliases: [
          "voice",
          "speech to text",
          "dictation",
          "microphone",
          ],
      }
    ),
    hintRow(
      ui.hint(tr("Dictation runs on OpenAI or OpenRouter — add that key in Providers.")),
      () => voiceOn() && !ui.hasCredential("openai") && !ui.hasCredential("openrouter")
    ),
    escolha(
      chat,
      tr("Ears"),
      null,
      tr(
        "Mini is quick, cheap and gets normal speech right; the full one is better with names, accents and noise."
      ),
      "voiceModel",
      () =>
        STT_MODELS.map((m) => ({
          value: m,
          label: prettyModelName(m),
          icon: STT_ICONS[m] ?? "ear",
        })),
      { visible: voiceOn, aliases: ["transcription", "whisper"] }
    ),
    escolha(
      chat,
      tr("What you speak"),
      null,
      tr(
        "Naming your language beats letting it guess — short takes are where guessing goes wrong."
      ),
      "voiceLanguage",

      () =>
        SPEECH_LANGS.map(([value, label]) =>
          value
            ? { value, label, glyph: value.toUpperCase() }
            : { value, label: tr(label), icon: "wand-sparkles" }
        ),
      { visible: voiceOn, aliases: ["language", "spoken language"] }
    ),
    toggle(
      tr("Read answers out loud"),
      tr("Adds a Listen button under every answer."),
      "ttsEnabled",
      {
        aliases: ["voice", "text to speech", "tts", "listen", "read aloud"],
      }
    ),
    custom(
      tr("Who reads"),
      null,
      tr(
        "OpenAI voices are ready to use. ElevenLabs sounds better and is the only one that can read in YOUR voice — clone it in their app and it shows up in the list below."
      ),
      ui.ttsProvider,
      { visible: ttsOn, aliases: ["elevenlabs", "voice", "tts"] }
    ),
    hintRow(
      ui.hint(tr("Add your OpenAI key in Providers to hear anything.")),
      () => openaiReads() && !ui.hasCredential("openai")
    ),
    escolha(
      chat,
      tr("Voice"),
      null,
      tr("Eleven of them — tap ▶ in the list to hear one before you pick it."),
      "ttsVoice",
      () =>
        OPENAI_VOICES.map((v) => ({
          value: v,
          label: nomeProprio(v),
          icon: "audio-lines",
        })),
      { visible: openaiReads, aliases: ["voice"] }
    ),

    escolha(
      chat,
      tr("OpenAI voice quality"),
      tr("Quality"),
      tr(
        "gpt-4o-mini-tts reads with intention; tts-1 is the cheap classic; the HD one is the same voice, cleaner."
      ),
      "ttsModel",
      () =>
        OPENAI_TTS_MODELS.map((m) => ({
          value: m,
          label: m,
          icon: TTS_ICONS[m] ?? "audio-lines",
        })),
      { visible: openaiReads, aliases: ["quality"] }
    ),
    custom(
      tr("Test OpenAI voice"),
      tr("Test"),
      tr("Plays one short line with the settings above."),
      ui.testVoice,
      { visible: openaiReads, aliases: ["play sample", "test voice"] }
    ),

    custom(
      tr("{provider} key", { provider: "ElevenLabs" }),
      null,
      tr(
        "From elevenlabs.io › Profile › API key. Stored in the OS keychain (not in data.json)."
      ),
      ui.elevenKey,
      { visible: elevenReads, aliases: KEY_ALIASES }
    ),
    custom(
      tr("Your voices"),
      null,
      tr(
        "Fetch what your account has — the stock voices and any you cloned, including your own."
      ),
      ui.elevenFetch,
      { visible: elevenReads, aliases: ["clone", "cloned", "voices", "elevenlabs"] }
    ),
    custom(
      tr("ElevenLabs voice"),
      tr("Voice"),
      tr(
        "Cloned ones are marked — that is the one that sounds like you. Tap ▶ in the list to hear any of them."
      ),
      ui.elevenVoice,
      { visible: () => elevenReads() && s().elevenVoices.length > 0, aliases: ["voice"] }
    ),
    hintRow(
      ui.hint(tr("No voices loaded yet — hit Fetch voices.")),
      () => elevenReads() && s().elevenVoices.length === 0 && !!s().elevenApiKey
    ),
    escolha(
      chat,
      tr("ElevenLabs voice quality"),
      tr("Quality"),
      tr("Multilingual sounds best; the faster ones answer sooner."),
      "elevenModel",
      () =>
        ELEVEN_MODELS.map((m) => ({
          value: m.id,
          label: tr(m.label),
          icon: ELEVEN_ICONS[m.id] ?? "audio-lines",
        })),
      { visible: elevenReads, aliases: ["quality"] }
    ),
    custom(
      tr("Test ElevenLabs voice"),
      tr("Test"),
      tr("Plays one short line with the settings above."),
      ui.testVoice,
      { visible: elevenReads, aliases: ["play sample", "test voice"] }
    ),
  ]);

  group({ tab: "vault" }, {}, [
    text(
      tr("Chats folder"),
      tr(
        "Each chat is a .md file under <folder>/<mode>/. The default is visible so file-sync plugins (Google Drive, Obsidian Sync…) copy them between devices. A folder starting with a dot stays out of the explorer, search and graph — and out of those syncs."
      ),
      "chatsPath",
      { aliases: ["folder", "chats", "path"] }
    ),
    text(
      tr("Skills folder"),
      tr("Each skill is a .md note (frontmatter + prompt body)."),
      "skillsPath",
      { aliases: ["folder", "path"] }
    ),

    text(
      tr("Index folder"),
      tr(
        "Where the Vault Q&A index lives. Changing it starts a fresh index there — the current one stays in the old folder, and switching back loads it again."
      ),
      "ragIndexPath",
      { aliases: ["folder", "path", "index", "rag", "embeddings"] }
    ),
  ]);

  const rag: Place = { tab: "rag" };
  group(rag, {}, [
    custom(
      tr("Embedding model"),
      null,
      tr(
        "Needs the key of that model's provider. Without an index, Vault Q&A falls back to keyword search. Fetch models on a provider to list the embedding models your account has."
      ),
      ui.embeddingModel,
      { aliases: ["embeddings", "rag", "model"] }
    ),

    escolha(
      rag,
      tr("Index precision"),
      null,
      tr(
        "How much detail each note keeps in the index. Lighter takes less space and memory; Light and Minimal also shrink the vectors on OpenAI's text-embedding-3. Applies on the next index update, which rebuilds it from scratch."
      ),
      "ragQuantProfile",
      () => QUANT_ITENS.map((i) => ({ ...i, label: tr(i.label) })),
      { aliases: ["quantization", "precision", "int8", "memory"] }
    ),
    toggle(
      tr("Search the index in pieces"),
      tr(
        "Reads the index about 4 MB at a time instead of all at once — keeps memory low on big vaults, which matters on the phone. The catch: every index update then rebuilds it whole and re-embeds the vault, which costs tokens."
      ),
      "ragStreamShards",
      { aliases: ["shards", "pieces", "memory", "streamed"] }
    ),
    toggle(
      tr("Auto re-index on note changes"),
      tr("Re-embeds only changed notes (costs tokens). Only runs once an index exists."),
      "ragAutoReindex",
      { aliases: ["reindex", "index"] }
    ),
    custom(tr("Index"), null, "", ui.index, {
      aliases: ["index", "index vault", "rag"],
    }),
  ]);

  group({ tab: "agent" }, {}, [
    escolha(
      { tab: "agent" },
      tr("Permission level"),
      null,
      tr(
        "When the agent stops to ask before changing the vault. In YOLO, deletes run on their own too when Obsidian sends deleted files to a trash (set to delete permanently, they still ask). Every change can be undone from the chat while Obsidian is open."
      ),
      "agentPermissionLevel",
      () =>
        (Object.keys(PERMISSION_LABELS) as PermissionLevel[]).map((l) => ({
          value: l,
          label: tr(PERMISSION_LABELS[l]),
          icon: PERMISSION_ICONS[l],
        })),
      { aliases: ["permissions", "yolo", "confirm"] }
    ),
    toggle(
      tr("Show diff before applying edits"),
      tr("Preview every change the agent wants to write."),
      "agentDiffApproval",
      { aliases: ["diff", "preview", "approval"] }
    ),
    text(
      tr("Agent instructions file"),
      tr(
        "Vault path to an instructions file read fresh on every turn (default: AGENT.md). Falls back to agent.md or CLAUDE.md if empty."
      ),
      "agentInstructionsPath",
      { aliases: ["agent.md", "claude.md", "instructions", "rules"] }
    ),
    toggle(
      tr("Web access"),
      tr(
        "Let the agent search the web and open public pages when a task needs it. In Ask and Vault, each request shows you the address or the search first; local addresses are always refused."
      ),
      "agentWeb",
      { aliases: ["web", "internet", "search", "url", "fetch"] }
    ),
    custom(
      tr("{provider} key", { provider: "Tavily" }),
      null,
      tr(
        "For web search, from tavily.com › API keys: 1,000 free searches a month, no card needed. Without it the agent can still open pages. Stored in the OS keychain (not in data.json)."
      ),
      ui.tavilyKey,
      { visible: () => s().agentWeb !== false, aliases: [...KEY_ALIASES, "tavily", "web search"] }
    ),
  ]);

  if (ui.isMobile) {
    group({ tab: "mobile" }, {}, [
      toggle(
        tr("Keep screen on while writing"),
        tr(
          "Keeps the screen awake while the AI is writing a reply, like a video. It may sleep again as soon as the reply is done."
        ),
        "keepAwakeWhileWriting",
        { aliases: ["wake lock", "screen on", "stay awake"] }
      ),
      toggle(
        tr("Fullscreen"),
        tr(
          "Fullscreen hides the drawer chrome and the global navbar while Corvus is the active tab. Chats always use it on their own; this switch only changes the other screens. The menu button stays, so you are never stuck."
        ),
        "mobileFullscreen",
        { aliases: ["full screen"] }
      ),
      toggle(
        tr("Haptics"),
        tr(
          "A short buzz on every tap. Android only — iPhone doesn't let a plugin touch the Taptic Engine."
        ),
        "hapticsEnabled",
        { aliases: ["vibration", "vibrate"] }
      ),
    ]);
  }

  return { items, places };
}

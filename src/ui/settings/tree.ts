import type {
  Setting,
  SettingDefinition,
  SettingDefinitionGroup,
  SettingDefinitionItem,
  SettingGroup,
  SettingGroupItem,
} from "obsidian";
import type { CorvusSettings } from "../../settings";
import { PROVIDERS } from "../../core/providersMeta";
import {
  EFFORT_ICONS,
  EFFORT_LABELS,
  EFFORT_LEVELS,
  type EffortLevel,
} from "../../core/effort";
import { CHAT_MODES } from "../../core/session";
import { MODULES, STARTUP_DASHBOARD } from "../modules";
import { QUANT_ITEMS } from "./searchIndex";
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

interface TabDef {
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

export function capitalize(s: string): string {
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

interface SettingsTree {
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

  function pickRow(
    at: Place,
    name: string,
    shown: string | null,
    desc: string,
    key: TextKey,
    getItems: () => PickItem[],
    more: RowExtras = {}
  ): SettingDefinition {
    return custom(name, shown, desc, ui.pick(key, getItems, at.tab), more);
  }

  group(null, { cls: "corvus-set-flat corvus-set-navgroup" }, [
    { name: "", render: ui.nav, searchable: false },
  ]);

  group({ tab: "providers" }, { cls: "corvus-set-flat corvus-set-railgroup" }, [
    { name: "", render: ui.rail, searchable: false },
  ]);

  for (const p of PROVIDERS) {
    const at: Place = { tab: "providers", provider: p.id };

    group(at, { heading: p.name }, [
      p.credential !== "ollamaEndpoint"
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
            "A free daily quota, if you turn it on under Data controls on platform.openai.com."
          ),
          "openaiDataSharing",

          { aliases: ["free", "quota", "data controls", "tier"] }
        ),

        pickRow(
          at,
          tr("Usage tier"),
          null,
          tr(
            "Tier 1–2: 250k tokens/day (2.5M on mini and nano). Tier 3+: 1M (10M)."
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
              "Counts all your OpenAI API use, not just this vault, and no image models. Terms as of {date}.",
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
    pickRow(
      chat,
      tr("Provider"),
      null,
      tr("Which provider a new chat opens with."),
      "defaultProvider",
      () => PROVIDERS.map((p) => ({ value: p.id, label: p.name, icon: p.icon })),
      { aliases: ["default provider"] }
    ),
    pickRow(
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
    pickRow(
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
    pickRow(
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
        "In dollars, for paid models, from public token prices. Warns at 80% and 100%. Empty means no limit."
      ),
      ui.spendLimit,
      { aliases: ["budget", "limit", "spending", "cost"] }
    ),
    toggle(
      tr("Stop paid models at the limit"),
      tr(
        "At the limit, paid models pause until midnight. Free, local and unpriced models keep working."
      ),
      "blockAtLimit",
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
        "Lets it suggest notes for a project. Sends only paths, never contents. Off by default."
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
        "Adds a microphone to the composer: speak, the words land in the box, send when ready."
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
    pickRow(
      chat,
      tr("Ears"),
      null,
      tr(
        "Mini is quick and cheap; the full one handles names, accents and noise better."
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
    pickRow(
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
        "OpenAI voices work as is. ElevenLabs sounds better and can read in your own cloned voice."
      ),
      ui.ttsProvider,
      { visible: ttsOn, aliases: ["elevenlabs", "voice", "tts"] }
    ),
    hintRow(
      ui.hint(tr("Add your OpenAI key in Providers to hear anything.")),
      () => openaiReads() && !ui.hasCredential("openai")
    ),
    pickRow(
      chat,
      tr("Voice"),
      null,
      tr("Eleven of them — tap ▶ in the list to hear one before you pick it."),
      "ttsVoice",
      () =>
        OPENAI_VOICES.map((v) => ({
          value: v,
          label: capitalize(v),
          icon: "audio-lines",
        })),
      { visible: openaiReads, aliases: ["voice"] }
    ),

    pickRow(
      chat,
      tr("OpenAI voice quality"),
      tr("Quality"),
      tr(
        "mini-tts reads with intention; tts-1 is the cheap classic; HD is the same voice, cleaner."
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
        "Cloned ones are marked. Tap ▶ to hear any of them."
      ),
      ui.elevenVoice,
      { visible: () => elevenReads() && s().elevenVoices.length > 0, aliases: ["voice"] }
    ),
    hintRow(
      ui.hint(tr("No voices loaded yet — hit Fetch voices.")),
      () => elevenReads() && s().elevenVoices.length === 0 && !!s().elevenApiKey
    ),
    pickRow(
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
        "Each chat is a .md file under <folder>/<mode>/. Visible so sync plugins copy it; a leading dot hides it from explorer, search and graph."
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
        "Where the Q&A index lives. Changing it starts fresh there; the old folder keeps its copy."
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
        "Needs that provider's key. Without an index, Q&A falls back to keyword search."
      ),
      ui.embeddingModel,
      { aliases: ["embeddings", "rag", "model"] }
    ),

    pickRow(
      rag,
      tr("Index precision"),
      null,
      tr(
        "How much detail each note keeps. Lighter saves space and memory. Applies on the next full rebuild."
      ),
      "ragQuantProfile",
      () => QUANT_ITEMS.map((i) => ({ ...i, label: tr(i.label) })),
      { aliases: ["quantization", "precision", "int8", "memory"] }
    ),
    toggle(
      tr("Search the index in pieces"),
      tr(
        "Reads the index 4 MB at a time, easier on memory on the phone. Every update then rebuilds and re-embeds the whole vault, costing tokens."
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
    pickRow(
      { tab: "agent" },
      tr("Permission level"),
      null,
      tr(
        "When the agent asks before changing the vault. YOLO also lets deletes run, unless Obsidian deletes permanently. Every change can be undone from the chat."
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
        "Path to an instructions file, reread every turn. Default AGENT.md, else agent.md or CLAUDE.md."
      ),
      "agentInstructionsPath",
      { aliases: ["agent.md", "claude.md", "instructions", "rules"] }
    ),
    toggle(
      tr("Web access"),
      tr(
        "Lets the agent search the web and open pages. In Ask and Vault it asks first; local addresses are refused."
      ),
      "agentWeb",
      { aliases: ["web", "internet", "search", "url", "fetch"] }
    ),
    custom(
      tr("{provider} key", { provider: "Tavily" }),
      null,
      tr(
        "From tavily.com › API keys: 1,000 free searches a month. Stored in the OS keychain, not data.json."
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
          "Keeps the screen awake while the AI writes. It may sleep once the reply is done."
        ),
        "keepAwakeWhileWriting",
        { aliases: ["wake lock", "screen on", "stay awake"] }
      ),
      toggle(
        tr("Fullscreen"),
        tr(
          "Hides the drawer chrome and navbar while Corvus is active. Chats use it anyway; this affects the other screens. The menu button stays."
        ),
        "mobileFullscreen",
        { aliases: ["full screen"] }
      ),
      toggle(
        tr("Haptics"),
        tr(
          "A short buzz on every tap. Android only."
        ),
        "hapticsEnabled",
        { aliases: ["vibration", "vibrate"] }
      ),
    ]);
  }

  return { items, places };
}

import { mark } from "./i18n/tr";

export interface IconCategory {
  id: string;

  label: string;

  icon: string;
  icons: string[];
}

export const ICON_CATALOG: IconCategory[] = [
  {
    id: "work",
    icon: "briefcase",
    label: mark("Work"),
    icons: [
      "briefcase", "target", "clipboard-list", "presentation", "handshake",
      "building-2", "users", "calendar", "clock", "check-check", "trending-up",
      "dollar-sign", "receipt", "wallet", "scale", "stamp", "piggy-bank",
      "landmark", "trophy", "rocket", "archive",
    ],
  },
  {
    id: "study",
    icon: "graduation-cap",
    label: mark("Study"),
    icons: [
      "graduation-cap", "book", "book-open", "library", "notebook-pen",
      "highlighter", "microscope", "flask-conical", "atom", "brain",
      "languages", "calculator", "ruler", "glasses", "binoculars",
      "lightbulb", "telescope", "medal",
    ],
  },
  {
    id: "writing",
    icon: "pencil",
    label: mark("Writing"),
    icons: [
      "pencil", "pen-line", "feather", "type", "quote", "file-text",
      "notebook", "bookmark", "scroll", "newspaper", "list", "align-left",
      "text-cursor-input", "signature", "message-circle", "link",
    ],
  },
  {
    id: "code",
    icon: "terminal",
    label: mark("Code"),
    icons: [
      "terminal", "braces", "code", "git-branch", "database", "server", "bug",
      "cpu", "binary", "package", "cloud", "globe", "keyboard", "wifi",
      "lock", "regex", "battery",
    ],
  },
  {
    id: "creative",
    icon: "palette",
    label: mark("Creative"),
    icons: [
      "palette", "brush", "camera", "film", "music", "mic", "headphones",
      "image", "wand-2", "scissors", "shapes", "pen-tool", "sparkles",
      "drama", "guitar", "clapperboard", "paintbrush", "swatch-book",
      "video",
    ],
  },
  {
    id: "home",
    icon: "home",
    label: mark("Home"),
    icons: [
      "home", "bed", "sofa", "lamp", "shopping-cart", "shirt",
      "washing-machine", "hammer", "wrench", "plug", "key", "door-open",
      "trash-2", "recycle", "axe", "paint-roller", "phone",
    ],
  },
  {
    id: "health",
    icon: "heart-pulse",
    label: mark("Health"),
    icons: [
      "heart", "heart-pulse", "stethoscope", "dumbbell", "activity", "pill",
      "bike", "footprints", "moon", "sun", "bath", "syringe",
    ],
  },
  {
    id: "nature",
    icon: "leaf",
    label: mark("Nature"),
    icons: [
      "leaf", "sprout", "tree-pine", "trees", "flower", "droplet", "mountain",
      "waves", "snowflake", "bird", "fish", "paw-print", "sunrise", "wind",
      "flame", "earth", "rainbow", "shell", "snail", "cloud-rain",
      "dog", "cat", "tractor", "umbrella",
    ],
  },
  {
    id: "travel",
    icon: "plane",
    label: mark("Travel"),
    icons: [
      "plane", "car", "train-front", "ship", "sailboat", "map", "map-pin",
      "compass", "luggage", "tent", "ticket", "backpack", "hotel", "fuel",
      "anchor",
    ],
  },
  {
    id: "life",
    icon: "user",
    label: mark("Life"),
    icons: [
      "user", "baby", "heart-handshake", "hand-heart", "gift",
      "party-popper", "smile", "flag", "shield", "bell", "hourglass",
      "dice-5", "puzzle",
    ],
  },
  {
    id: "food",
    icon: "utensils",
    label: mark("Food"),
    icons: [
      "utensils", "utensils-crossed", "chef-hat", "cooking-pot", "soup",
      "pizza", "sandwich", "egg", "salad", "apple", "carrot", "wheat",
      "cake", "cookie", "croissant", "ice-cream-cone", "coffee", "cup-soda",
      "wine", "beer", "milk",
    ],
  },
  {
    id: "symbols",
    icon: "star",
    label: mark("Symbols"),
    icons: [
      "star", "crown", "gem", "award", "badge-check", "check", "x", "info",
      "alert-triangle", "asterisk", "hash", "at-sign", "percent", "infinity",
      "zap", "circle-dot", "sticker",
    ],
  },
];

export function iconCatalogSize(): number {
  return ICON_CATALOG.reduce((n, c) => n + c.icons.length, 0);
}

export function iconCategoryOf(icon: string): string | null {
  return ICON_CATALOG.find((c) => c.icons.includes(icon))?.id ?? null;
}

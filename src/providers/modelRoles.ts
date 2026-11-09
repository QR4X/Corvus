import type { ModelCategory } from "./modelDescriptions";
import { mark } from "../i18n/tr";

export interface RoleModelEntry {
  model: string;
  provider: string;
}

export type RoleId =
  | "chat" 
  | "reasoning"
  | "image"
  | "video"
  | "tts" 
  | "embedding"
  | "other";

export const ROLE_ORDER: RoleId[] = [
  "chat",
  "reasoning",
  "image",
  "video",
  "tts",
  "embedding",
  "other",
];

export const ROLE_LABELS: Record<RoleId, string> = {
  chat: "Chat",
  reasoning: mark("Reasoning"),
  image: mark("Image"),
  video: mark("Video"),
  tts: mark("Text-to-speech"),
  embedding: mark("Text embedding"),
  other: mark("Other"),
};

export const ROLE_ICONS: Record<RoleId, string> = {
  chat: "messages-square",
  reasoning: "brain",
  image: "image",
  video: "clapperboard",
  tts: "audio-lines",
  embedding: "boxes",
  other: "box",
};

export function categoryToRole(cat: ModelCategory): RoleId {
  switch (cat) {
    case "chat-vision":
    case "chat-text":
    case "agent":
      return "chat";
    case "reasoning":
      return "reasoning";
    case "image-gen":
      return "image";
    case "video-gen":
      return "video";
    case "audio-gen":
      return "tts";
    case "embedding":
      return "embedding";
    default:
      return "other";
  }
}

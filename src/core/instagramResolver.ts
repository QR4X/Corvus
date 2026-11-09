import { requestUrl } from "obsidian";
import {
  transcribeAudio,
  getTranscriptionCredential,
  type TranscribeCredential,
  type TranscribeCredentialSettings,
} from "../providers/transcribe";
import { ProviderError } from "../providers/base";
import type { NoteAttachment } from "../providers/base";

export { getTranscriptionCredential };
export type { TranscribeCredential, TranscribeCredentialSettings };

export const IG_APP_ID = "936619743392459";

export const IG_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Instagram 307.0.0.34.111";

export function isInstagramUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  return /instagram\.com\/(?:reel|reels|p|share\/reel)\/([A-Za-z0-9_-]+)/i.test(
    url.trim()
  );
}

export function extractInstagramShortcode(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const m = url.trim().match(/instagram\.com\/(?:reel|reels|p|share\/reel)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

export function findInstagramUrlInText(text: string): string | null {
  if (!text || typeof text !== "string") return null;
  const m = text.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p|share\/reel)\/[A-Za-z0-9_-]+[^\s]*/i);
  return m ? m[0] : null;
}

export interface InstagramMediaInfo {
  videoUrl: string;
  shortcode: string;
  caption?: string;
}

export async function resolveInstagramVideoUrl(
  urlOrShortcode: string
): Promise<InstagramMediaInfo> {
  const shortcode = extractInstagramShortcode(urlOrShortcode) || urlOrShortcode.trim();
  if (!shortcode || !/^[A-Za-z0-9_-]+$/.test(shortcode)) {
    throw new ProviderError("Ungültige Instagram Reel-URL oder Shortcode.", "unknown");
  }

  try {
    const graphUrl = `https://www.instagram.com/graphql/query/?query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8&variables=${encodeURIComponent(
      JSON.stringify({ shortcode })
    )}`;

    const res = await requestUrl({
      url: graphUrl,
      method: "GET",
      headers: {
        "User-Agent": IG_USER_AGENT,
        "X-IG-App-ID": IG_APP_ID,
        Accept: "*/*",
      },
      throw: false,
    });

    if (res.status === 200 && res.json) {
      const data = (res.json as { data?: { shortcode_media?: Record<string, unknown> } })?.data
        ?.shortcode_media;
      if (data && data.is_video && typeof data.video_url === "string") {
        const edges = (data.edge_media_to_caption as { edges?: Array<{ node?: { text?: string } }> })?.edges;
        const caption = edges?.[0]?.node?.text;
        return {
          videoUrl: data.video_url,
          shortcode,
          caption: typeof caption === "string" ? caption.trim() : undefined,
        };
      }
    }
  } catch (err) {
    console.warn("[Corvus] Instagram GraphQL query_hash fehlgeschlagen:", err);
  }

  try {
    const queryIdUrl = `https://www.instagram.com/graphql/query/?query_id=9496392173716084&variables=${encodeURIComponent(
      JSON.stringify({
        shortcode,
        __relay_internal__pv__PolarisFeedShareMenurelayprovider: true,
        __relay_internal__pv__PolarisIsLoggedInrelayprovider: false,
      })
    )}`;

    const res = await requestUrl({
      url: queryIdUrl,
      method: "GET",
      headers: {
        "User-Agent": IG_USER_AGENT,
        "X-IG-App-ID": IG_APP_ID,
        Accept: "*/*",
      },
      throw: false,
    });

    if (res.status === 200 && res.json) {
      const item = (res.json as {
        data?: {
          xdt_api__v1__media__shortcode__web_info?: {
            items?: Array<{
              video_versions?: Array<{ url?: string }>;
              caption?: { text?: string };
            }>;
          };
        };
      })?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0];

      const vUrl = item?.video_versions?.[0]?.url;
      if (typeof vUrl === "string" && vUrl.trim()) {
        const cap = item?.caption?.text;
        return {
          videoUrl: vUrl.trim(),
          shortcode,
          caption: typeof cap === "string" ? cap.trim() : undefined,
        };
      }
    }
  } catch (err) {
    console.warn("[Corvus] Instagram GraphQL query_id fehlgeschlagen:", err);
  }

  try {
    const fullUrl = `https://www.instagram.com/reel/${shortcode}/`;
    const formBody = `recaptchaToken=&q=${encodeURIComponent(fullUrl)}&t=media&lang=en`;

    const res = await requestUrl({
      url: "https://v3.igdownloader.app/api/ajaxSearch",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Origin: "https://igdownloader.app",
        Referer: "https://igdownloader.app/",
      },
      body: formBody,
      throw: false,
    });

    if (res.status === 200 && res.json) {
      const html = (res.json as { data?: string })?.data ?? "";
      const match = html.match(/href="([^"]+)"[^>]*download/i) || html.match(/href="([^"]+)"/i);
      if (match && match[1] && match[1].startsWith("http")) {
        return {
          videoUrl: match[1],
          shortcode,
        };
      }
    }
  } catch (err) {
    console.warn("[Corvus] Instagram Fallback Resolver fehlgeschlagen:", err);
  }

  throw new ProviderError(
    `Konnte das Instagram Reel (${shortcode}) nicht auflösen. Möglicherweise ist das Video privat oder gelöscht.`,
    "network"
  );
}

export async function downloadInstagramMedia(videoUrl: string): Promise<Uint8Array> {
  const res = await requestUrl({
    url: videoUrl,
    method: "GET",
    headers: {
      "User-Agent": IG_USER_AGENT,
      Referer: "https://www.instagram.com/",
    },
    throw: false,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new ProviderError(
      `Download des Reel-Videos fehlgeschlagen (HTTP ${res.status}).`,
      "network"
    );
  }

  if (!res.arrayBuffer || res.arrayBuffer.byteLength === 0) {
    throw new ProviderError("Leere Videodatei heruntergeladen.", "unknown");
  }

  return new Uint8Array(res.arrayBuffer);
}

export interface TranscribeReelOptions {
  apiKey: string;
  provider?: "openai" | "openrouter";
  model?: string;
  language?: string;
}

export interface ReelTranscriptResult {
  shortcode: string;
  url: string;
  transcript: string;
  caption?: string;
}

export async function transcribeInstagramReel(
  reelUrl: string,
  opts: TranscribeReelOptions
): Promise<ReelTranscriptResult> {
  const shortcode = extractInstagramShortcode(reelUrl);
  if (!shortcode) {
    throw new ProviderError("Ungültige Instagram-URL.", "unknown");
  }

  const mediaInfo = await resolveInstagramVideoUrl(shortcode);
  const videoBytes = await downloadInstagramMedia(mediaInfo.videoUrl);

  const defaultModel = opts.provider === "openrouter" ? "openai/whisper-1" : "whisper-1";

  const transcript = await transcribeAudio({
    apiKey: opts.apiKey,
    provider: opts.provider,
    model: opts.model || defaultModel,
    data: videoBytes,
    filename: `${shortcode}.mp4`,
    language: opts.language,
  });

  return {
    shortcode,
    url: reelUrl,
    transcript,
    caption: mediaInfo.caption,
  };
}

export function reelAttachment(result: ReelTranscriptResult): NoteAttachment {
  const parts: string[] = [`Quelle: ${result.url}`];
  if (result.caption) {
    parts.push(`Beschreibung:\n${result.caption}`);
  }
  parts.push(`Gesprochenes Transkript:\n${result.transcript}`);

  return {
    type: "note",
    path: `🎞️ Reel (${result.shortcode})`,
    content: parts.join("\n\n"),
  };
}

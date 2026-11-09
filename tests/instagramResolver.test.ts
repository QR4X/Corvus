import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("obsidian", () => import("./obsidian-stub"));

const {
  isInstagramUrl,
  extractInstagramShortcode,
  findInstagramUrlInText,
  resolveInstagramVideoUrl,
  downloadInstagramMedia,
  transcribeInstagramReel,
  reelAttachment,
} = await import("../src/core/instagramResolver");

const { __setRequestUrl } = await import("./obsidian-stub");

afterEach(() => __setRequestUrl(null));

describe("Instagram URL Matcher & Extractor", () => {
  it("erkennt verschiedene Instagram Reel- und Post-URLs", () => {
    expect(isInstagramUrl("https://www.instagram.com/reel/C8abc_123/")).toBe(true);
    expect(isInstagramUrl("https://instagram.com/reels/C8abc_123")).toBe(true);
    expect(isInstagramUrl("https://www.instagram.com/p/C8abc_123/?utm_source=ig_web_copy_link")).toBe(true);
    expect(isInstagramUrl("https://instagram.com/share/reel/C8abc_123/")).toBe(true);
    expect(isInstagramUrl("https://youtube.com/watch?v=123")).toBe(false);
    expect(isInstagramUrl("hallo welt")).toBe(false);
  });

  it("extrahiert den Shortcode zuverlässig", () => {
    expect(extractInstagramShortcode("https://www.instagram.com/reel/C8abc_123/")).toBe("C8abc_123");
    expect(extractInstagramShortcode("https://instagram.com/p/XYZ987/?igsh=1234")).toBe("XYZ987");
    expect(extractInstagramShortcode("C8abc_123")).toBe(null);
  });

  it("findet Instagram URLs in Fliesstext", () => {
    const text = "Schau dir mal dieses Video an: https://www.instagram.com/reel/C8abc_123/?igsh=xyz - was denkst du?";
    expect(findInstagramUrlInText(text)).toBe("https://www.instagram.com/reel/C8abc_123/?igsh=xyz");
    expect(findInstagramUrlInText("Kein Link hier")).toBe(null);
  });
});

describe("resolveInstagramVideoUrl", () => {
  it("löst Video-URL über GraphQL query_hash auf", async () => {
    __setRequestUrl(async (opts: any) => {
      if (opts.url.includes("query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8")) {
        return {
          status: 200,
          json: {
            data: {
              shortcode_media: {
                is_video: true,
                video_url: "https://scontent.cdninstagram.com/v/test.mp4",
                edge_media_to_caption: {
                  edges: [{ node: { text: "Reel Beschreibung" } }],
                },
              },
            },
          },
        };
      }
      return { status: 404 };
    });

    const res = await resolveInstagramVideoUrl("https://www.instagram.com/reel/C8abc_123/");
    expect(res.videoUrl).toBe("https://scontent.cdninstagram.com/v/test.mp4");
    expect(res.shortcode).toBe("C8abc_123");
    expect(res.caption).toBe("Reel Beschreibung");
  });

  it("nutzt GraphQL query_id als zweiten Schritt, wenn query_hash fehlschlägt", async () => {
    __setRequestUrl(async (opts: any) => {
      if (opts.url.includes("query_hash=")) {
        return { status: 403 };
      }
      if (opts.url.includes("query_id=9496392173716084")) {
        return {
          status: 200,
          json: {
            data: {
              xdt_api__v1__media__shortcode__web_info: {
                items: [
                  {
                    video_versions: [{ url: "https://scontent.cdninstagram.com/v/query_id_test.mp4" }],
                    caption: { text: "QueryID Caption" },
                  },
                ],
              },
            },
          },
        };
      }
      return { status: 404 };
    });

    const res = await resolveInstagramVideoUrl("C8abc_123");
    expect(res.videoUrl).toBe("https://scontent.cdninstagram.com/v/query_id_test.mp4");
    expect(res.caption).toBe("QueryID Caption");
  });

  it("fällt auf Web Resolver zurück, wenn GraphQL blockiert wird", async () => {
    __setRequestUrl(async (opts: any) => {
      if (opts.url.includes("graphql")) {
        return { status: 403 };
      }
      if (opts.url.includes("igdownloader.app")) {
        return {
          status: 200,
          json: {
            data: '<div class="download-items__btn"><a href="https://download.video/reel.mp4" download>Download Video</a></div>',
          },
        };
      }
      return { status: 404 };
    });

    const res = await resolveInstagramVideoUrl("https://www.instagram.com/reel/C8abc_123/");
    expect(res.videoUrl).toBe("https://download.video/reel.mp4");
    expect(res.shortcode).toBe("C8abc_123");
  });

  it("wirft ProviderError, wenn alle Resolver scheitern", async () => {
    __setRequestUrl(async () => ({ status: 500 }));
    await expect(resolveInstagramVideoUrl("https://www.instagram.com/reel/C8abc_123/")).rejects.toThrow(
      /Konnte das Instagram Reel/
    );
  });
});

describe("downloadInstagramMedia", () => {
  it("lädt die Binärdaten des Videos herunter", async () => {
    const buffer = new Uint8Array([0, 1, 2, 3]).buffer;
    __setRequestUrl(async () => ({
      status: 200,
      arrayBuffer: buffer,
    }));

    const bytes = await downloadInstagramMedia("https://test.com/video.mp4");
    expect(bytes.length).toBe(4);
    expect(bytes[0]).toBe(0);
    expect(bytes[3]).toBe(3);
  });

  it("wirft Fehler bei fehlerhaftem HTTP-Status", async () => {
    __setRequestUrl(async () => ({ status: 404 }));
    await expect(downloadInstagramMedia("https://test.com/video.mp4")).rejects.toThrow(
      /Download des Reel-Videos fehlgeschlagen/
    );
  });
});

describe("transcribeInstagramReel & reelAttachment", () => {
  it("baut die Pipeline komplett durch und formatiert das Attachment", async () => {
    __setRequestUrl(async (opts: any) => {
      if (opts.url.includes("graphql")) {
        return {
          status: 200,
          json: {
            data: {
              shortcode_media: {
                is_video: true,
                video_url: "https://test.com/reel.mp4",
                edge_media_to_caption: { edges: [{ node: { text: "Das ist die Caption" } }] },
              },
            },
          },
        };
      }
      if (opts.url.includes("reel.mp4")) {
        return {
          status: 200,
          arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
        };
      }
      if (opts.url.includes("api.openai.com/v1/audio/transcriptions")) {
        return {
          status: 200,
          json: { text: "Hier ist der gesprochene Text des Videos." },
        };
      }
      return { status: 404 };
    });

    const result = await transcribeInstagramReel("https://www.instagram.com/reel/C8abc_123/", {
      apiKey: "test-openai-key",
    });

    expect(result.shortcode).toBe("C8abc_123");
    expect(result.transcript).toBe("Hier ist der gesprochene Text des Videos.");
    expect(result.caption).toBe("Das ist die Caption");

    const attachment = reelAttachment(result);
    expect(attachment.type).toBe("note");
    expect(attachment.path).toBe("🎞️ Reel (C8abc_123)");
    expect(attachment.content).toContain("Quelle: https://www.instagram.com/reel/C8abc_123/");
    expect(attachment.content).toContain("Beschreibung:\nDas ist die Caption");
    expect(attachment.content).toContain("Gesprochenes Transkript:\nHier ist der gesprochene Text des Videos.");
  });

  it("funktioniert nahtlos mit OpenRouter-Key und Endpunkt", async () => {
    let transcribeCalledWith: any = null;
    __setRequestUrl(async (opts: any) => {
      if (opts.url.includes("graphql")) {
        return {
          status: 200,
          json: {
            data: {
              shortcode_media: {
                is_video: true,
                video_url: "https://test.com/reel.mp4",
              },
            },
          },
        };
      }
      if (opts.url.includes("reel.mp4")) {
        return {
          status: 200,
          arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
        };
      }
      if (opts.url.includes("openrouter.ai/api/v1/audio/transcriptions")) {
        transcribeCalledWith = opts;
        return {
          status: 200,
          json: { text: "Transkribiert mit OpenRouter Whisper!" },
        };
      }
      return { status: 404 };
    });

    const result = await transcribeInstagramReel("https://www.instagram.com/reel/C8abc_123/", {
      apiKey: "sk-or-v1-testkey",
      provider: "openrouter",
    });

    expect(result.transcript).toBe("Transkribiert mit OpenRouter Whisper!");
    expect(transcribeCalledWith.url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
    expect(transcribeCalledWith.headers["HTTP-Referer"]).toBe("https://github.com/QR4X/M.I.L.A");
  });

  it("deaktiviertes instagramReelsEnabled schaltet die Tool- und Link-Erkennung ab", async () => {
    const { applyControl, readControl } = await import("../src/ui/settings/values");
    const settings: any = { instagramReelsEnabled: true };
    expect(readControl(settings, "instagramReelsEnabled")).toBe(true);

    applyControl(settings, "instagramReelsEnabled", false);
    expect(settings.instagramReelsEnabled).toBe(false);
    expect(readControl(settings, "instagramReelsEnabled")).toBe(false);
  });
});

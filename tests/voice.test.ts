import { describe, it, expect } from "vitest";
import { extensionFor } from "../src/ui/useVoice";

describe("extensionFor", () => {
  it("follows the container the device picked", () => {
    expect(extensionFor("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionFor("audio/mp4")).toBe("mp4");
    expect(extensionFor("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extensionFor("audio/wav")).toBe("wav");
  });

  it("falls back to webm, which Chromium records, for unknown types", () => {
    expect(extensionFor("")).toBe("webm");
    expect(extensionFor("audio/x-anything")).toBe("webm");
  });
});

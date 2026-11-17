import { describe, it, expect } from "vitest";
import {
  MAX_SEGMENT_MS,
  MIN_SEGMENT_MS,
  SILENCE_MS,
  bestAudioMime,
  joinTranscripts,
  shouldRotate,
} from "../src/ui/voiceSegments";

describe("shouldRotate", () => {
  it("does not cut in the middle of a sentence", () => {
    expect(
      shouldRotate({ durationMs: MIN_SEGMENT_MS + 5000, silenceMs: 0 })
    ).toBe(false);
  });

  it("does not cut on a pause too short to end a sentence", () => {
    expect(
      shouldRotate({ durationMs: MIN_SEGMENT_MS + 1000, silenceMs: SILENCE_MS - 1 })
    ).toBe(false);
  });

  it("cuts on a pause after the minimum length", () => {
    expect(
      shouldRotate({ durationMs: MIN_SEGMENT_MS, silenceMs: SILENCE_MS })
    ).toBe(true);
  });

  it("holds the cut while the segment is short, even in silence", () => {
    expect(
      shouldRotate({ durationMs: MIN_SEGMENT_MS - 1, silenceMs: 5000 })
    ).toBe(false);
  });

  it("cuts at the maximum length even without a pause", () => {
    expect(shouldRotate({ durationMs: MAX_SEGMENT_MS, silenceMs: 0 })).toBe(true);
  });

  it("cuts only at the maximum length without a level meter", () => {
    expect(shouldRotate({ durationMs: MAX_SEGMENT_MS - 1, silenceMs: 0 })).toBe(
      false
    );
    expect(shouldRotate({ durationMs: MAX_SEGMENT_MS + 1, silenceMs: 0 })).toBe(
      true
    );
  });
});

describe("joinTranscripts", () => {
  it("joins the final segments in order and appends the partial", () => {
    expect(joinTranscripts(["hi good morning", "how are you"], "I wanted")).toBe(
      "hi good morning how are you I wanted"
    );
  });

  it("returns only the final segments without a partial", () => {
    expect(joinTranscripts(["hi", "bye"])).toBe("hi bye");
  });

  it("skips a segment still in flight instead of blocking the rest", () => {
    expect(joinTranscripts(["one", undefined, "three"], "four")).toBe(
      "one three four"
    );
  });

  it("collapses duplicate spaces and trims the edges", () => {
    expect(joinTranscripts(["  one  ", "", "  two "], "  three ")).toBe(
      "one two three"
    );
  });

  it("returns an empty string, not 'undefined', when nothing was recorded", () => {
    expect(joinTranscripts([], "")).toBe("");
    expect(joinTranscripts([undefined, undefined])).toBe("");
  });
});

describe("bestAudioMime", () => {
  it("prefers opus, the lightest and fastest", () => {
    expect(bestAudioMime(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("falls back to what the device supports", () => {
    expect(bestAudioMime((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(bestAudioMime((t) => t.startsWith("audio/ogg"))).toBe(
      "audio/ogg;codecs=opus"
    );
  });

  it("lets the recorder choose when the device supports none", () => {
    expect(bestAudioMime(() => false)).toBeUndefined();
  });
});

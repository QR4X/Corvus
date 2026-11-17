import { describe, it, expect } from "vitest";
import { samplePhrase, pickSampleLanguage } from "../src/ui/settings/voiceSample";
import { SPEECH_LANGS } from "../src/ui/settings/tree";

describe("pickSampleLanguage", () => {
  it("the dictation language wins over the Obsidian language", () => {
    expect(pickSampleLanguage("pt", "en")).toBe("pt");
  });

  it("with dictation on Auto (empty), the Obsidian language applies", () => {
    expect(pickSampleLanguage("", "es")).toBe("es");
    expect(pickSampleLanguage(undefined, "fr")).toBe("fr");
  });

  it("the region is ignored: pt-BR is pt, and zh_TW without a phrase falls back to English", () => {
    expect(pickSampleLanguage("", "pt-BR")).toBe("pt");
    expect(pickSampleLanguage("", "zh_TW")).toBe("en");
  });

  it("a language without a phrase defers to the next candidate", () => {
    expect(pickSampleLanguage("ko", "de")).toBe("de");
    expect(pickSampleLanguage("", "")).toBe("en");
  });
});

describe("samplePhrase", () => {
  it("says the voice name so consecutive samples are distinguishable", () => {
    expect(samplePhrase("Coral", "pt")).toBe(
      "Oi! Eu sou Coral, e é assim que eu vou ler as suas respostas."
    );
    expect(samplePhrase("Alloy", "en")).toBe(
      "Hi, I'm Alloy. This is how I'll read your answers out loud."
    );
  });

  it("every dictation language has its own phrase containing the name", () => {
    for (const [code] of SPEECH_LANGS) {
      if (!code) continue;
      const phrase = samplePhrase("Sage", code);
      expect(phrase, code).toContain("Sage");
      expect(phrase, code).not.toContain("{name}");
      if (code !== "en") expect(phrase, code).not.toBe(samplePhrase("Sage", "en"));
    }
  });

  it("an unknown language speaks English", () => {
    expect(samplePhrase("Ash", "xx")).toBe(samplePhrase("Ash", "en"));
  });
});

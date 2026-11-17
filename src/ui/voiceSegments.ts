export const SILENCE_LEVEL = 0.05;

export const SILENCE_MS = 350;

export const MIN_SEGMENT_MS = 2500;

export const MAX_SEGMENT_MS = 12000;

export function shouldRotate(p: {
  durationMs: number;
  silenceMs: number;
}): boolean {
  if (p.durationMs >= MAX_SEGMENT_MS) return true;
  return p.durationMs >= MIN_SEGMENT_MS && p.silenceMs >= SILENCE_MS;
}

export function joinTranscripts(
  finals: ReadonlyArray<string | undefined>,
  partial = ""
): string {
  return [...finals, partial]
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function bestAudioMime(supports: (t: string) => boolean): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return candidates.find((t) => supports(t));
}

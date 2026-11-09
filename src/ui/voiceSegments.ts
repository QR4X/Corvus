export const SILENCE_LEVEL = 0.05;

export const SILENCE_MS = 350;

export const MIN_SEGMENT_MS = 2500;

export const MAX_SEGMENT_MS = 12000;

export function shouldRotate(p: {
  duracaoMs: number;
  silencioMs: number;
}): boolean {
  if (p.duracaoMs >= MAX_SEGMENT_MS) return true;
  return p.duracaoMs >= MIN_SEGMENT_MS && p.silencioMs >= SILENCE_MS;
}

export function joinTranscripts(
  finais: ReadonlyArray<string | undefined>,
  parcial = ""
): string {
  return [...finais, parcial]
    .map((t) => (t ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function bestAudioMime(suporta: (t: string) => boolean): string | undefined {
  const candidatos = [
    "audio/webm;codecs=opus",
    "audio/ogg;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];
  return candidatos.find((t) => suporta(t));
}

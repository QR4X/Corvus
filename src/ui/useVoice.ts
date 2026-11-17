import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../providers/transcribe";
import {
  SILENCE_LEVEL,
  bestAudioMime,
  joinTranscripts,
  shouldRotate,
} from "./voiceSegments";
import { tr } from "../i18n/tr";

const INTERIM_MS = 3000;

const FIRST_INTERIM_MS = 1500;

const TIMESLICE_MS = 1000;

const AUDIO_BPS = 32000;

const LEVEL_MS = 60;

const LEVEL_SLOTS = 48;

const MAX_SECONDS = 300;

type VoiceState =
  | "idle"

  | "recording"

  | "working";

export interface Voice {
  state: VoiceState;

  seconds: number;

  levels: number[];

  start: () => Promise<boolean>;

  cancel: () => void;

  finish: () => void;
}

interface VoiceOptions {

  apiKey: () => string;

  model: () => string;

  language: () => string;

  onTranscript: (text: string) => void;

  onFinal: (text: string) => void;

  onNotice: (message: string) => void;

  onCancel: () => void;
}

export function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

interface Segment {
  chunks: Blob[];
  mime: string;
}

export function useVoice(opts: VoiceOptions): Voice {
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const bufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const interimRef = useRef<number | null>(null);
  const firstInterimRef = useRef<number | null>(null);

  const segsRef = useRef<Segment[]>([]);

  const finalsRef = useRef<(string | undefined)[]>([]);

  const failedRef = useRef<Set<number>>(new Set());

  const pendingRef = useRef<Promise<unknown>[]>([]);

  const currentSegRef = useRef(0);

  const partialRef = useRef("");

  const partialBusyRef = useRef(false);

  const silenceSinceRef = useRef<number | null>(null);

  const segStartedRef = useRef(0);

  const rotatingRef = useRef(false);

  const discardedRef = useRef(false);
  const startedAtRef = useRef(0);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    if (levelTimerRef.current !== null) window.clearInterval(levelTimerRef.current);
    if (interimRef.current !== null) window.clearInterval(interimRef.current);
    if (firstInterimRef.current !== null)
      window.clearTimeout(firstInterimRef.current);
    rafRef.current = null;
    tickRef.current = null;
    levelTimerRef.current = null;
    interimRef.current = null;
    firstInterimRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    recRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const readLevel = useCallback(() => {
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (!analyser || !buf) return null;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) {
      const d = (v - 128) / 128;
      sum += d * d;
    }
    const level = Math.min(1, Math.sqrt(sum / buf.length) * 3);
    if (level < SILENCE_LEVEL) {
      if (silenceSinceRef.current === null)
        silenceSinceRef.current = Date.now();
    } else {
      silenceSinceRef.current = null;
    }
    return level;
  }, []);

  const publish = useCallback(() => {
    if (discardedRef.current) return;
    optsRef.current.onTranscript(
      joinTranscripts(finalsRef.current, partialRef.current)
    );
  }, []);

  const upload = useCallback(async (seg: Segment) => {
    const blob = new Blob(seg.chunks, { type: seg.mime });
    return transcribeAudio({
      apiKey: optsRef.current.apiKey(),
      model: optsRef.current.model(),
      language: optsRef.current.language() || undefined,
      filename: `voice.${extensionFor(seg.mime)}`,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
  }, []);

  const transcribeSegment = useCallback(
    async (i: number) => {
      const seg = segsRef.current[i];
      if (!seg || seg.chunks.length === 0) return;
      try {
        const text = await upload(seg);
        finalsRef.current[i] = text.trim();
        failedRef.current.delete(i);
        publish();
      } catch {

        failedRef.current.add(i);
      }
    },
    [upload, publish]
  );

  const transcribePartial = useCallback(async () => {
    if (partialBusyRef.current) return;
    const rec = recRef.current;
    if (!rec || rec.state !== "recording") return;
    const i = currentSegRef.current;
    const seg = segsRef.current[i];
    if (!seg || seg.chunks.length === 0) return;
    partialBusyRef.current = true;
    try {
      const text = await upload({ chunks: [...seg.chunks], mime: seg.mime });

      if (
        currentSegRef.current === i &&
        !discardedRef.current &&
        recRef.current?.state === "recording"
      ) {
        partialRef.current = text.trim();
        publish();
      }
    } catch { void 0; } finally {
      partialBusyRef.current = false;
    }
  }, [upload, publish]);

  const openRecorder = useCallback((i: number) => {
    const stream = streamRef.current;
    if (!stream) return null;
    const mime = bestAudioMime((t) =>
      typeof MediaRecorder !== "undefined" &&
      typeof MediaRecorder.isTypeSupported === "function"
        ? MediaRecorder.isTypeSupported(t)
        : false
    );
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        audioBitsPerSecond: AUDIO_BPS,
      });
    } catch {

      rec = new MediaRecorder(stream);
    }
    segsRef.current[i] = {
      chunks: [],
      mime: rec.mimeType || mime || "audio/webm",
    };
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) segsRef.current[i]?.chunks.push(e.data);
    };
    return rec;
  }, []);

  const rotate = useCallback(
    (onStop: () => void) => {
      const i = currentSegRef.current;
      pendingRef.current.push(transcribeSegment(i));
      currentSegRef.current = i + 1;
      partialRef.current = "";
      segStartedRef.current = Date.now();
      silenceSinceRef.current = null;

      const rec = openRecorder(currentSegRef.current);
      if (!rec) return;
      rec.onstop = onStop;
      recRef.current = rec;
      rec.start(TIMESLICE_MS);
    },
    [openRecorder, transcribeSegment]
  );

  const finalize = useCallback(async () => {
    pendingRef.current.push(transcribeSegment(currentSegRef.current));
    partialRef.current = "";
    await Promise.allSettled(pendingRef.current);
    pendingRef.current = [];
    const failed = [...failedRef.current];
    if (failed.length) {
      await Promise.allSettled(failed.map((i) => transcribeSegment(i)));
    }
    publish();
    if (failedRef.current.size) {
      optsRef.current.onNotice(
        tr("Part of the recording could not be transcribed — check the connection.")
      );
    }
    if (!discardedRef.current) {
      optsRef.current.onFinal(joinTranscripts(finalsRef.current, ""));
    }
  }, [publish, transcribeSegment]);

  const start = useCallback(async () => {
    if (recRef.current) return false;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      optsRef.current.onNotice(tr("This device can't record audio."));
      return false;
    }
    if (!optsRef.current.apiKey().trim()) {
      optsRef.current.onNotice(
        tr("Voice needs an OpenAI key — add one in Settings › Providers.")
      );
      return false;
    }
    let stream: MediaStream;
    try {

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        optsRef.current.onNotice(
          tr("Microphone blocked — allow it for Obsidian and try again.")
        );
        return false;
      }
    }
    streamRef.current = stream;
    segsRef.current = [];
    finalsRef.current = [];
    failedRef.current = new Set();
    pendingRef.current = [];
    currentSegRef.current = 0;
    partialRef.current = "";
    partialBusyRef.current = false;
    silenceSinceRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    discardedRef.current = false;
    rotatingRef.current = false;
    setSeconds(0);

    setLevels(new Array(LEVEL_SLOTS).fill(0));

    const rec = openRecorder(0);
    if (!rec) return false;
    const onStop = () => {

      if (rotatingRef.current) {
        rotatingRef.current = false;
        rotate(onStop);
        return;
      }
      cleanup();
      if (discardedRef.current) {
        setState("idle");
        return;
      }
      setState("working");
      void finalize().then(() => setState("idle"));
    };
    rec.onstop = onStop;
    recRef.current = rec;
    rec.start(TIMESLICE_MS);

    startedAtRef.current = Date.now();
    segStartedRef.current = Date.now();

    tickRef.current = window.setInterval(() => {
      const active = recRef.current;
      if (active?.state !== "recording") return;
      const now = Date.now();
      const elapsed = (now - startedAtRef.current) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) {
        optsRef.current.onNotice(tr("Recording stopped at 5 minutes."));
        active.stop();
        return;
      }
      const silenceMs = silenceSinceRef.current
        ? now - silenceSinceRef.current
        : 0;
      if (
        !rotatingRef.current &&
        shouldRotate({ durationMs: now - segStartedRef.current, silenceMs })
      ) {
        rotatingRef.current = true;
        try {
          active.stop();
        } catch {
          rotatingRef.current = false;
        }
      }
    }, 200);

    levelTimerRef.current = window.setInterval(() => {
      if (recRef.current?.state === "recording") readLevel();
    }, LEVEL_MS);

    const requestInterim = () => {
      const active = recRef.current;
      if (active?.state !== "recording") return;

      active.requestData();
      void transcribePartial();
    };
    firstInterimRef.current = window.setTimeout(requestInterim, FIRST_INTERIM_MS);
    interimRef.current = window.setInterval(requestInterim, INTERIM_MS);

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;
      bufRef.current = new Uint8Array(analyser.frequencyBinCount);

      let last = 0;
      const sample = () => {
        rafRef.current = window.requestAnimationFrame(sample);
        const now = performance.now();
        if (now - last < 90) return;
        last = now;
        const level = readLevel();
        if (level !== null) setLevels((prev) => [...prev, level].slice(-LEVEL_SLOTS));
      };
      sample();
    } catch { void 0; }

    setState("recording");
    return true;
  }, [openRecorder, cleanup, finalize, readLevel, rotate, transcribePartial]);

  const cancel = useCallback(() => {
    const rec = recRef.current;
    discardedRef.current = true;
    rotatingRef.current = false;
    optsRef.current.onCancel();
    if (rec && rec.state !== "inactive") rec.stop();
    else {
      cleanup();
      setState("idle");
    }
  }, [cleanup]);

  const finish = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    rotatingRef.current = false;
    try {
      if (rec.state !== "inactive") rec.stop();
    } catch {

      cleanup();
      setState("idle");
    }
  }, [cleanup]);

  useEffect(() => {
    if (state === "idle" || state === "working") return;

    const doc = activeDocument ?? document;
    const onHide = () => {
      if (doc.hidden) finish();
    };
    doc.addEventListener("visibilitychange", onHide);
    return () => doc.removeEventListener("visibilitychange", onHide);
  }, [state, finish]);

  return { state, seconds, levels, start, cancel, finish };
}

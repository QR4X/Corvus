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

export type VoiceState =
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

export interface VoiceOptions {

  apiKey: () => string;

  model: () => string;

  language: () => string;

  onTranscript: (text: string) => void;

  onFinal: (text: string) => void;

  onNotice: (message: string) => void;

  onCancel: () => void;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

interface Segmento {
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
  const nivelRef = useRef<number | null>(null);
  const interimRef = useRef<number | null>(null);
  const primeiroParcialRef = useRef<number | null>(null);

  const segsRef = useRef<Segmento[]>([]);

  const finaisRef = useRef<(string | undefined)[]>([]);

  const falharamRef = useRef<Set<number>>(new Set());

  const pendentesRef = useRef<Promise<unknown>[]>([]);

  const atualRef = useRef(0);

  const parcialRef = useRef("");

  const parcialOcupadoRef = useRef(false);

  const silencioDesdeRef = useRef<number | null>(null);

  const segIniciadoRef = useRef(0);

  const rotacionandoRef = useRef(false);

  const discardedRef = useRef(false);
  const startedAtRef = useRef(0);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (tickRef.current !== null) window.clearInterval(tickRef.current);
    if (nivelRef.current !== null) window.clearInterval(nivelRef.current);
    if (interimRef.current !== null) window.clearInterval(interimRef.current);
    if (primeiroParcialRef.current !== null)
      window.clearTimeout(primeiroParcialRef.current);
    rafRef.current = null;
    tickRef.current = null;
    nivelRef.current = null;
    interimRef.current = null;
    primeiroParcialRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    recRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const lerNivel = useCallback(() => {
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (!analyser || !buf) return null;
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) {
      const d = (v - 128) / 128;
      sum += d * d;
    }
    const nivel = Math.min(1, Math.sqrt(sum / buf.length) * 3);
    if (nivel < SILENCE_LEVEL) {
      if (silencioDesdeRef.current === null)
        silencioDesdeRef.current = Date.now();
    } else {
      silencioDesdeRef.current = null;
    }
    return nivel;
  }, []);

  const publicar = useCallback(() => {
    if (discardedRef.current) return;
    optsRef.current.onTranscript(
      joinTranscripts(finaisRef.current, parcialRef.current)
    );
  }, []);

  const enviar = useCallback(async (seg: Segmento) => {
    const blob = new Blob(seg.chunks, { type: seg.mime });
    return transcribeAudio({
      apiKey: optsRef.current.apiKey(),
      model: optsRef.current.model(),
      language: optsRef.current.language() || undefined,
      filename: `voice.${extensionFor(seg.mime)}`,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
  }, []);

  const transcreverSegmento = useCallback(
    async (i: number) => {
      const seg = segsRef.current[i];
      if (!seg || seg.chunks.length === 0) return;
      try {
        const text = await enviar(seg);
        finaisRef.current[i] = text.trim();
        falharamRef.current.delete(i);
        publicar();
      } catch {

        falharamRef.current.add(i);
      }
    },
    [enviar, publicar]
  );

  const transcreverParcial = useCallback(async () => {
    if (parcialOcupadoRef.current) return;
    const rec = recRef.current;
    if (!rec || rec.state !== "recording") return;
    const i = atualRef.current;
    const seg = segsRef.current[i];
    if (!seg || seg.chunks.length === 0) return;
    parcialOcupadoRef.current = true;
    try {
      const text = await enviar({ chunks: [...seg.chunks], mime: seg.mime });

      if (
        atualRef.current === i &&
        !discardedRef.current &&
        recRef.current?.state === "recording"
      ) {
        parcialRef.current = text.trim();
        publicar();
      }
    } catch { void 0; } finally {
      parcialOcupadoRef.current = false;
    }
  }, [enviar, publicar]);

  const abrirRecorder = useCallback((i: number) => {
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

  const rotacionar = useCallback(
    (aoParar: () => void) => {
      const i = atualRef.current;
      pendentesRef.current.push(transcreverSegmento(i));
      atualRef.current = i + 1;
      parcialRef.current = "";
      segIniciadoRef.current = Date.now();
      silencioDesdeRef.current = null;

      const rec = abrirRecorder(atualRef.current);
      if (!rec) return;
      rec.onstop = aoParar;
      recRef.current = rec;
      rec.start(TIMESLICE_MS);
    },
    [abrirRecorder, transcreverSegmento]
  );

  const finalizar = useCallback(async () => {
    pendentesRef.current.push(transcreverSegmento(atualRef.current));
    parcialRef.current = "";
    await Promise.allSettled(pendentesRef.current);
    pendentesRef.current = [];
    const falhos = [...falharamRef.current];
    if (falhos.length) {
      await Promise.allSettled(falhos.map((i) => transcreverSegmento(i)));
    }
    publicar();
    if (falharamRef.current.size) {
      optsRef.current.onNotice(
        tr("Part of the recording could not be transcribed — check the connection.")
      );
    }
    if (!discardedRef.current) {
      optsRef.current.onFinal(joinTranscripts(finaisRef.current, ""));
    }
  }, [publicar, transcreverSegmento]);

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
    finaisRef.current = [];
    falharamRef.current = new Set();
    pendentesRef.current = [];
    atualRef.current = 0;
    parcialRef.current = "";
    parcialOcupadoRef.current = false;
    silencioDesdeRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    discardedRef.current = false;
    rotacionandoRef.current = false;
    setSeconds(0);

    setLevels(new Array(LEVEL_SLOTS).fill(0));

    const rec = abrirRecorder(0);
    if (!rec) return false;
    const aoParar = () => {

      if (rotacionandoRef.current) {
        rotacionandoRef.current = false;
        rotacionar(aoParar);
        return;
      }
      cleanup();
      if (discardedRef.current) {
        setState("idle");
        return;
      }
      setState("working");
      void finalizar().then(() => setState("idle"));
    };
    rec.onstop = aoParar;
    recRef.current = rec;
    rec.start(TIMESLICE_MS);

    startedAtRef.current = Date.now();
    segIniciadoRef.current = Date.now();

    tickRef.current = window.setInterval(() => {
      const atual = recRef.current;
      if (atual?.state !== "recording") return;
      const agora = Date.now();
      const elapsed = (agora - startedAtRef.current) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) {
        optsRef.current.onNotice(tr("Recording stopped at 5 minutes."));
        atual.stop();
        return;
      }
      const silencioMs = silencioDesdeRef.current
        ? agora - silencioDesdeRef.current
        : 0;
      if (
        !rotacionandoRef.current &&
        shouldRotate({ duracaoMs: agora - segIniciadoRef.current, silencioMs })
      ) {
        rotacionandoRef.current = true;
        try {
          atual.stop();
        } catch {
          rotacionandoRef.current = false;
        }
      }
    }, 200);

    nivelRef.current = window.setInterval(() => {
      if (recRef.current?.state === "recording") lerNivel();
    }, LEVEL_MS);

    const rodada = () => {
      const atual = recRef.current;
      if (atual?.state !== "recording") return;

      atual.requestData();
      void transcreverParcial();
    };
    primeiroParcialRef.current = window.setTimeout(rodada, FIRST_INTERIM_MS);
    interimRef.current = window.setInterval(rodada, INTERIM_MS);

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
        const nivel = lerNivel();
        if (nivel !== null) setLevels((prev) => [...prev, nivel].slice(-LEVEL_SLOTS));
      };
      sample();
    } catch { void 0; }

    setState("recording");
    return true;
  }, [abrirRecorder, cleanup, finalizar, lerNivel, rotacionar, transcreverParcial]);

  const cancel = useCallback(() => {
    const rec = recRef.current;
    discardedRef.current = true;
    rotacionandoRef.current = false;
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
    rotacionandoRef.current = false;
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

export type QuantPrecision = "float32" | "int8";

export interface QuantProfile {
  id: string;

  precision: QuantPrecision;

  targetDim: number;

  emoji: string;
}

export const QUANT_PROFILES: Record<string, QuantProfile> = {
  precision: { id: "precision", precision: "float32", targetDim: 0, emoji: "🎯" },
  balanced: { id: "balanced", precision: "int8", targetDim: 0, emoji: "⚖️" },
  light: { id: "light", precision: "int8", targetDim: 512, emoji: "🪶" },
  minimal: { id: "minimal", precision: "int8", targetDim: 256, emoji: "🔬" },
};

export function getQuantProfile(id: string): QuantProfile {
  return QUANT_PROFILES[id] ?? QUANT_PROFILES.balanced;
}

export function unitNormalize(v: number[] | Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

export function quantizeEmbedding(
  raw: number[] | Float32Array,
  precision: QuantPrecision
): Float32Array | Int8Array {
  const unit = unitNormalize(raw);
  if (precision === "float32") return unit;
  const out = new Int8Array(unit.length);
  for (let i = 0; i < unit.length; i++) {
    const q = Math.round(unit[i] * 127);

    out[i] = q > 127 ? 127 : q < -127 ? -127 : q;
  }
  return out;
}

export function scoreVectors(
  a: Float32Array | Int8Array,
  b: Float32Array | Int8Array,
  precision: QuantPrecision
): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return precision === "int8" ? dot / (127 * 127) : dot;
}

export function typedArrayToBase64(arr: Int8Array | Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let binary = "";
  const chunk = 0x8000; 
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  return btoa(binary);
}

export function base64ToTypedArray(
  b64: string,
  precision: QuantPrecision
): Float32Array | Int8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (precision === "int8") return new Int8Array(bytes.buffer);

  const usable = bytes.byteLength - (bytes.byteLength % 4);
  return new Float32Array(bytes.buffer, 0, usable / 4);
}

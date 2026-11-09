import { describe, it, expect } from "vitest";
import { arrayBufferToDataUrl } from "../src/rag/embeddings";

function bytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 255;
  return b;
}

describe("arrayBufferToDataUrl", () => {
  it("bate com o base64 do Node, atravessando vários pedaços", () => {
    const b = bytes(100_000);
    expect(arrayBufferToDataUrl(b.buffer as ArrayBuffer, "image/png")).toBe(
      "data:image/png;base64," + Buffer.from(b).toString("base64")
    );
  });

  it("cobre os 256 valores de byte", () => {
    const b = new Uint8Array(256).map((_, i) => i);
    expect(arrayBufferToDataUrl(b.buffer, "image/jpeg")).toBe(
      "data:image/jpeg;base64," + Buffer.from(b).toString("base64")
    );
  });

  it("buffer vazio vira data URL vazia", () => {
    expect(arrayBufferToDataUrl(new ArrayBuffer(0), "image/png")).toBe(
      "data:image/png;base64,"
    );
  });
});

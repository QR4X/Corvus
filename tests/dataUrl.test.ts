import { describe, it, expect } from "vitest";
import { arrayBufferToDataUrl } from "../src/rag/embeddings";

function bytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 255;
  return b;
}

describe("arrayBufferToDataUrl", () => {
  it("matches Node base64 across several chunks", () => {
    const b = bytes(100_000);
    expect(arrayBufferToDataUrl(b.buffer as ArrayBuffer, "image/png")).toBe(
      "data:image/png;base64," + Buffer.from(b).toString("base64")
    );
  });

  it("covers all 256 byte values", () => {
    const b = new Uint8Array(256).map((_, i) => i);
    expect(arrayBufferToDataUrl(b.buffer, "image/jpeg")).toBe(
      "data:image/jpeg;base64," + Buffer.from(b).toString("base64")
    );
  });

  it("turns an empty buffer into an empty data URL", () => {
    expect(arrayBufferToDataUrl(new ArrayBuffer(0), "image/png")).toBe(
      "data:image/png;base64,"
    );
  });
});

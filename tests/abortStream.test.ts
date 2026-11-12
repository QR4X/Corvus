import { describe, it, expect } from "vitest";
import { isAbortError, raceAbort } from "../src/providers/abort";

describe("abort helpers", () => {
  it("recognises AbortError regardless of realm", () => {
    expect(isAbortError({ name: "AbortError" })).toBe(true);
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });

  it("rejects immediately when aborted while the work is non-abortable", async () => {
    const c = new AbortController();
    const never = new Promise<string>(() => undefined);
    const p = raceAbort(never, c.signal);
    c.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects when already aborted and passes results otherwise", async () => {
    const c = new AbortController();
    await expect(raceAbort(Promise.resolve("ok"), c.signal)).resolves.toBe("ok");
    c.abort();
    await expect(raceAbort(Promise.resolve("ok"), c.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

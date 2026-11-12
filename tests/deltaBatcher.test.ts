import { describe, it, expect } from "vitest";
import { createDeltaBatcher } from "../src/core/deltaBatcher";
import { createTicker } from "../src/ui/ticker";
import { useChatStore } from "../src/store/chat";

function manualScheduler() {
  const queue: Array<() => void> = [];
  const schedule = (run: () => void) => {
    queue.push(run);
    return () => {
      const i = queue.indexOf(run);
      if (i >= 0) queue.splice(i, 1);
    };
  };
  return { schedule, queue, tick: () => queue.splice(0).forEach((r) => r()) };
}

describe("createDeltaBatcher", () => {
  it("coalesces many deltas into one apply per frame", () => {
    const s = manualScheduler();
    const seen: string[] = [];
    const b = createDeltaBatcher((t) => seen.push(t), s.schedule);
    b.push("a");
    b.push("b");
    b.push("c");
    expect(seen).toEqual([]);
    s.tick();
    expect(seen).toEqual(["abc"]);
    b.push("d");
    s.tick();
    expect(seen).toEqual(["abc", "d"]);
  });

  it("flushes pending text immediately and cancels the frame", () => {
    const s = manualScheduler();
    const seen: string[] = [];
    const b = createDeltaBatcher((t) => seen.push(t), s.schedule);
    b.push("x");
    b.flush();
    expect(seen).toEqual(["x"]);
    expect(s.queue).toHaveLength(0);
    b.flush();
    expect(seen).toEqual(["x"]);
  });

  it("keeps working when the scheduler runs synchronously", () => {
    const seen: string[] = [];
    const b = createDeltaBatcher(
      (t) => seen.push(t),
      (run) => {
        run();
        return () => undefined;
      }
    );
    b.push("a");
    b.push("b");
    expect(seen).toEqual(["a", "b"]);
  });
});

describe("createTicker", () => {
  it("runs a single timer for all subscribers and stops when none remain", () => {
    let starts = 0;
    let stops = 0;
    let fire: () => void = () => undefined;
    const ticker = createTicker(
      1000,
      () => 42,
      (run) => {
        starts++;
        fire = run;
        return 1;
      },
      () => {
        stops++;
      }
    );
    const got: number[] = [];
    const u1 = ticker.subscribe((n) => got.push(n));
    const u2 = ticker.subscribe((n) => got.push(n));
    expect(starts).toBe(1);
    fire();
    expect(got).toEqual([42, 42]);
    u1();
    expect(stops).toBe(0);
    u2();
    expect(stops).toBe(1);
    expect(ticker.size()).toBe(0);
  });
});

describe("appendThought", () => {
  it("appends to the thought comment only", () => {
    const st = useChatStore.getState();
    const id = st.addMessage({ type: "ai-comment", content: "", thought: "" });
    st.appendThought(id, "he");
    st.appendThought(id, "llo");
    const m = useChatStore.getState().messages.find((x) => x.id === id);
    expect(m && m.type === "ai-comment" && m.thought).toBe("hello");
  });
});

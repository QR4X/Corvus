import { describe, it, expect, beforeEach } from "vitest";
import {
  startRun,
  getRun,
  clearRun,
  subscribe,
  _resetRuns,
} from "../src/assistant/store";
import { parseOptions } from "../src/assistant/parse";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => _resetRuns());

describe("a run outlives the caller that started it", () => {
  it("finishes even when nobody is watching", async () => {
    let resolveRun!: (r: { draft: unknown }) => void;
    startRun(
      "skill",
      [{ role: "user", text: "a weekly summary" }],
      () => new Promise((r) => (resolveRun = r))
    );
    expect(getRun("skill").phase).toBe("running");
    resolveRun({ draft: { name: "Weekly review" } });
    await flush();
    expect(getRun("skill").phase).toBe("done");
    expect(getRun("skill").result).toEqual({ name: "Weekly review" });
  });

  it("keeps the result until it is consumed", async () => {
    startRun("project", [], async () => ({ draft: { name: "Thesis" } }));
    await flush();
    expect(getRun("project").result).toEqual({ name: "Thesis" });
    clearRun("project");
    expect(getRun("project").phase).toBe("idle");
  });

  it("notifies subscribers", async () => {
    const seen: string[] = [];
    const unsubscribe = subscribe("skill", () => seen.push(getRun("skill").phase));
    startRun("skill", [], async () => ({ draft: 1 }));
    await flush();
    unsubscribe();
    expect(seen).toEqual(["running", "done"]);
  });

  it("does not leave the run stuck in running after a throw", async () => {
    startRun("skill", [], async () => {
      throw new Error("network dropped");
    });
    await flush();
    expect(getRun("skill").phase).toBe("error");
    expect(getRun("skill").error).toContain("network dropped");
  });

  it("replaces the previous run of the same kind", async () => {
    startRun("skill", [], async () => ({ draft: "old" }));
    await flush();
    startRun("skill", [], async () => ({ draft: "new" }));
    await flush();
    expect(getRun("skill").result).toBe("new");
  });

  it("keeps runs of different kinds independent", async () => {
    startRun("skill", [], async () => ({ draft: "s" }));
    startRun("description", [], async () => ({ draft: "d" }));
    await flush();
    expect(getRun("skill").result).toBe("s");
    expect(getRun("description").result).toBe("d");
  });
});

describe("follow-up questions", () => {
  it("adds the question to the conversation", async () => {
    startRun(
      "skill",
      [{ role: "user", text: "a summary" }],
      async () => ({ question: "What for?", options: ["Study", "Work"] })
    );
    await flush();
    const r = getRun("skill");
    expect(r.phase).toBe("asking");
    expect(r.options).toEqual(["Study", "Work"]);
    expect(r.turns.at(-1)).toEqual({ role: "assistant", text: "What for?" });
  });
});

describe("parseOptions", () => {
  it("passes the option chips through", () => {
    expect(parseOptions({ options: ["Study", "Work"] })).toEqual([
      "Study",
      "Work",
    ]);
  });

  it("keeps at most three options because the fourth chip is reserved", () => {
    const r = parseOptions({ options: ["a", "b", "c", "d", "e"] });
    expect(r).toEqual(["a", "b", "c"]);
  });

  it("truncates an option that holds a whole sentence", () => {
    expect(parseOptions({ options: ["x".repeat(80)] })[0]).toHaveLength(30);
  });

  it("ignores non-strings, blanks and duplicates", () => {
    expect(parseOptions({ options: [1, "ok", "  ", "ok", null] })).toEqual(["ok"]);
  });

  it("returns an empty list without options so the question can be open", () => {
    expect(parseOptions({ ask: "so?" })).toEqual([]);
    expect(parseOptions(null)).toEqual([]);
  });
});

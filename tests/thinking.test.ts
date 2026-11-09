import { describe, it, expect } from "vitest";
import { elapsedLabel, thinkingStatus } from "../src/ui/Thinking";

describe("thinkingStatus", () => {
  it("reports an honest model wait instead of a rotating placeholder", () => {
    expect(thinkingStatus()).toBe("Waiting for model response");
    expect(
      thinkingStatus({
        phase: "pending",
        iconPending: "sparkles",
        pendingText: "Thinking...",
      })
    ).toBe("Waiting for model response");
  });

  it("shows a real pending tool call and its exact arguments", () => {
    expect(
      thinkingStatus({
        phase: "pending",
        iconPending: "file-pen-line",
        pendingText: "Editing Notes/example.md",
        toolName: "vault_edit",
        toolArguments: { path: "Notes/example.md", oldStr: "old" },
      })
    ).toBe('vault_edit({"path":"Notes/example.md","oldStr":"old"})');
  });

  it("shows a real non-agent operation while it is active", () => {
    expect(
      thinkingStatus({
        phase: "pending",
        iconPending: "radar",
        pendingText: "Searching the vault",
      })
    ).toBe("Searching the vault");
  });
});

describe("elapsedLabel", () => {
  it("segundos enquanto cabem", () => {
    expect(elapsedLabel(0)).toBe("0s");
    expect(elapsedLabel(7_400)).toBe("7s");
    expect(elapsedLabel(59_900)).toBe("59s");
  });

  it("vira minuto com os segundos em duas casas", () => {
    expect(elapsedLabel(60_000)).toBe("1m 00s");
    expect(elapsedLabel(72_000)).toBe("1m 12s");
    expect(elapsedLabel(605_000)).toBe("10m 05s");
  });

  it("nunca mostra negativo", () => {
    expect(elapsedLabel(-3000)).toBe("0s");
  });
});

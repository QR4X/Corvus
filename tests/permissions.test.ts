import { describe, it, expect } from "vitest";
import { decideToolGate } from "../src/agent/permissions";
import type { ToolDefinition, PermissionLevel } from "../src/agent/types";

const tool = (destructive: boolean, irreversible = false): ToolDefinition =>
  ({
    name: "x",
    description: "",
    parameters: {},
    destructive,
    irreversible,
  } as ToolDefinition);

const gate = (
  t: ToolDefinition,
  level: PermissionLevel,
  approveAll: boolean,
  deleteGoesToTrash = false
) => decideToolGate(t, level, { approveAll, deleteGoesToTrash });

describe("decideToolGate", () => {
  it("always runs non-destructive tools automatically", () => {
    expect(gate(tool(false), "ask", false)).toBe("auto");
    expect(gate(tool(false), "yolo", false)).toBe("auto");
  });

  it("confirms destructive tools at the ask level", () => {
    expect(gate(tool(true), "ask", false)).toBe("confirm");
  });

  it("runs destructive tools automatically at yolo and vault levels", () => {
    expect(gate(tool(true), "yolo", false)).toBe("auto");
    expect(gate(tool(true), "vault", false)).toBe("auto");
  });

  it("honors approve-all at the ask level too", () => {
    expect(gate(tool(true), "ask", true)).toBe("auto");
  });

  it("always confirms deletes without trash, even with yolo or approve-all", () => {
    expect(gate(tool(true, true), "yolo", true)).toBe("confirm");
    expect(gate(tool(true, true), "yolo", false)).toBe("confirm");
    expect(gate(tool(true, true), "ask", true)).toBe("confirm");
  });

  it("with trash enabled, only yolo deletes without asking", () => {
    expect(gate(tool(true, true), "yolo", false, true)).toBe("auto");
    expect(gate(tool(true, true), "vault", false, true)).toBe("confirm");
    expect(gate(tool(true, true), "ask", false, true)).toBe("confirm");

    expect(gate(tool(true, true), "vault", true, true)).toBe("confirm");
  });
});

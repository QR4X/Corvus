import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS, getToolDefinition } from "../src/agent/toolSchemas";

describe("generate_image tool", () => {
  it("is registered in TOOL_DEFINITIONS", () => {
    expect(TOOL_DEFINITIONS.some((t) => t.name === "generate_image")).toBe(true);
  });

  it("is neither destructive nor irreversible because the image modal confirms it", () => {
    const def = getToolDefinition("generate_image");
    expect(def).toBeTruthy();
    expect(def!.destructive).toBe(false);
    expect(def!.irreversible).toBeFalsy();
  });

  it("requires the prompt parameter", () => {
    const def = getToolDefinition("generate_image")!;
    const params = def.parameters as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(params.properties.prompt).toBeTruthy();
    expect(params.required).toContain("prompt");
  });
});

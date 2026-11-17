import { describe, it, expect } from "vitest";
import { vaultEnabled, vaultDefault } from "../src/core/vaultContext";

describe("vaultDefault", () => {
  it("starts Vault Q&A and Agent with the vault on", () => {
    expect(vaultDefault("vault-qa")).toBe(true);
    expect(vaultDefault("agent")).toBe(true);
  });

  it("starts Chat with the vault off", () => {
    expect(vaultDefault("chat")).toBe(false);
  });

  it("does not turn the vault on for unknown modes", () => {
    expect(vaultDefault("research")).toBe(false);
    expect(vaultDefault("")).toBe(false);
  });
});

describe("vaultEnabled", () => {
  it("uses the mode default when the user has not chosen", () => {
    expect(vaultEnabled("chat", null)).toBe(false);
    expect(vaultEnabled("agent", null)).toBe(true);
  });

  it("lets the user's choice override the default in both directions", () => {
    expect(vaultEnabled("chat", true)).toBe(true);
    expect(vaultEnabled("agent", false)).toBe(false);
  });

  it("treats turning it off differently from never choosing", () => {
    expect(vaultEnabled("vault-qa", null)).toBe(true);
    expect(vaultEnabled("vault-qa", false)).toBe(false);
  });
});

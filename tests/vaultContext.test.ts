import { describe, it, expect } from "vitest";
import { vaultEnabled, vaultDefault } from "../src/core/vaultContext";

describe("vaultDefault", () => {
  it("Vault Q&A e Agent nascem ligados", () => {

    expect(vaultDefault("vault-qa")).toBe(true);
    expect(vaultDefault("agent")).toBe(true);
  });

  it("Chat nasce desligado", () => {

    expect(vaultDefault("chat")).toBe(false);
  });

  it("modo desconhecido não liga sozinho", () => {

    expect(vaultDefault("research")).toBe(false);
    expect(vaultDefault("")).toBe(false);
  });
});

describe("vaultAtivo", () => {
  it("sem escolha, vale o padrão do modo", () => {
    expect(vaultEnabled("chat", null)).toBe(false);
    expect(vaultEnabled("agent", null)).toBe(true);
  });

  it("a escolha da pessoa vence o padrão, nos dois sentidos", () => {
    expect(vaultEnabled("chat", true)).toBe(true);
    expect(vaultEnabled("agent", false)).toBe(false);
  });

  it("desligar NÃO é o mesmo que nunca ter mexido", () => {

    expect(vaultEnabled("vault-qa", null)).toBe(true);
    expect(vaultEnabled("vault-qa", false)).toBe(false);
  });
});

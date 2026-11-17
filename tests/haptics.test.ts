import { describe, it, expect } from "vitest";
import { isTap } from "../src/ui/haptics";

describe("ehToque", () => {
  it("dedo parado e rápido é toque", () => {
    expect(isTap(0, 0, 90)).toBe(true);
    expect(isTap(3, -4, 250)).toBe(true);
  });

  it("andou o bastante pra ser rolagem", () => {
    expect(isTap(0, 20, 200)).toBe(false);
    expect(isTap(-30, 2, 200)).toBe(false);
  });

  it("a folga é dos DOIS eixos — rolagem lateral também não vibra", () => {
    expect(isTap(9, 0, 100)).toBe(false);
    expect(isTap(8, 8, 100)).toBe(true);
  });

  it("segurou demais: não é resposta a nada", () => {
    expect(isTap(0, 0, 1200)).toBe(false);
  });
});

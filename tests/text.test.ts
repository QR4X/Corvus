import { describe, it, expect } from "vitest";
import { asText } from "../src/core/text";

describe("texto", () => {
  it("devolve string como está, inclusive vazia", () => {
    expect(asText("oi")).toBe("oi");
    expect(asText("")).toBe("");
  });

  it("não troca string vazia pelo padrão", () => {

    expect(asText("", "padrao")).toBe("");
  });

  it("converte número, booleano e bigint", () => {
    expect(asText(0)).toBe("0");
    expect(asText(-1.5)).toBe("-1.5");
    expect(asText(false)).toBe("false");
    expect(asText(10n)).toBe("10");
  });

  it("número não-finito cai no padrão (NaN na tela não diz nada)", () => {
    expect(asText(NaN)).toBe("");
    expect(asText(Infinity, "—")).toBe("—");
  });

  it("null e undefined caem no padrão", () => {
    expect(asText(null)).toBe("");
    expect(asText(undefined)).toBe("");
    expect(asText(null, "Untitled")).toBe("Untitled");
  });

  it("objeto e array NÃO viram [object Object]", () => {

    expect(asText({ a: 1 })).toBe("");
    expect(asText([1, 2])).toBe("");
    expect(asText({}, "default")).toBe("default");
  });

  it("função e símbolo caem no padrão", () => {
    expect(asText(() => "x")).toBe("");
    expect(asText(Symbol("s"))).toBe("");
  });
});

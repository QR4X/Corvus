import { describe, it, expect } from "vitest";
import {
  DEFAULT_EFFORT_CONFIGS,
  EFFORT_DESCRIPTIONS,
  EFFORT_LEVELS,
  describeEffort,
} from "../src/core/effort";
import {
  CAMPOS_DE_ESFORCO,
  comCampo,
  limitar,
  nivelEditado,
  paradasCom,
  resumoDoNivel,
} from "../src/ui/settings/effortEditor";

const campo = (key: string) => CAMPOS_DE_ESFORCO.find((c) => c.key === key)!;

describe("os sliders do editor de nível", () => {
  it("todo padrão de fábrica é uma parada do slider — cai exato, sem arredondar", () => {
    for (const l of EFFORT_LEVELS) {
      for (const c of CAMPOS_DE_ESFORCO.filter((x) => x.tipo === "numero")) {
        expect(c.paradas, `${l}.${c.key}`).toContain(DEFAULT_EFFORT_CONFIGS[l][c.key]);
      }
    }
  });

  it("toda parada cabe no intervalo do campo, e nenhuma se repete", () => {
    for (const c of CAMPOS_DE_ESFORCO.filter((x) => x.tipo === "numero")) {
      for (const p of c.paradas!) expect(limitar(p, c), `${c.key} ${p}`).toBe(p);
      expect(new Set(c.paradas).size, c.key).toBe(c.paradas!.length);
    }
  });

  it("os valores especiais são pontas do slider, com nome", () => {
    const tokens = campo("maxTokens");
    expect(tokens.paradas!.at(-1)).toBe(0); 
    expect(tokens.mostrar!(0)).toBe("No cap");
    expect(tokens.mostrar!(2048)).toBe("2k tokens");
    expect(campo("agentMaxTurns")).toBeUndefined();
    const temp = campo("temperature");
    expect(temp.paradas![0]).toBe(-1); 
    expect(temp.mostrar!(-1)).toBe("Provider default");
    expect(temp.paradas).toContain(0.7); 
    expect(campo("loopDetectionWindow").mostrar!(0)).toBe("Off");
    expect(campo("toolRetryOnError").mostrar!(0)).toBe("None");
    expect(campo("vaultExcerptChars").mostrar!(1200)).toBe("1,200 chars");
  });

  it("um valor do editor antigo fora das paradas ganha a sua, no lugar certo", () => {
    const tokens = campo("maxTokens");
    const com900 = paradasCom(tokens, 900);
    expect(com900.slice(1, 4)).toEqual([512, 900, 1000]);
    expect(com900.at(-1)).toBe(0); 
    expect(paradasCom(tokens, 250000).slice(-2)).toEqual([250000, 0]);
    expect(paradasCom(campo("temperature"), 0.25).slice(3, 6)).toEqual([0.2, 0.25, 0.3]);

    expect(paradasCom(tokens, 512)).toBe(tokens.paradas);
  });

  it("o ⓘ de cada ajuste explica de verdade: frase inteira, que se lê sozinha", () => {
    for (const c of CAMPOS_DE_ESFORCO) {
      expect(c.desc.length, c.key).toBeGreaterThan(60);
      expect(c.desc, c.key).toMatch(/\.$/);

      expect(c.desc, c.key).not.toMatch(/\bthose notes\b/);
    }
  });

  it("cada ajuste tem o seu desenho na frente do nome — e nenhum repete", () => {
    const icones = CAMPOS_DE_ESFORCO.map((c) => c.icone);
    for (const c of CAMPOS_DE_ESFORCO) expect(c.icone, c.key).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(icones).size).toBe(icones.length);

    expect(icones).not.toContain("rotate-ccw");
  });

  it("a parte do contexto só aparece com a resposta sem teto, logo abaixo dela", () => {
    const reserva = campo("contextReservePercent");
    expect(reserva.quando!({ ...DEFAULT_EFFORT_CONFIGS.max })).toBe(true);
    expect(reserva.quando!({ ...DEFAULT_EFFORT_CONFIGS.low })).toBe(false);
    const ordem = CAMPOS_DE_ESFORCO.map((c) => c.key);
    expect(ordem.indexOf("contextReservePercent")).toBe(ordem.indexOf("maxTokens") + 1);
  });
});

describe("esforço por nível", () => {
  it("overrides antigos de turnos não contam como ajuste nem reaparecem ao editar", () => {
    const old = { low: { agentMaxTurns: 5, maxTokens: 900 } };
    const onlyOld = { low: { agentMaxTurns: 5, maxTokens: undefined } };
    expect(nivelEditado(onlyOld, "low")).toBe(false);
    expect(comCampo(old, "low", "maxTokens", 1000)).toEqual({ low: { maxTokens: 1000 } });
    expect(describeEffort("low", old)).toBe("Fast and economical (≤900 tok)");
  });
  it("de fábrica, as descrições são as de antes, letra por letra", () => {
    expect(EFFORT_DESCRIPTIONS).toEqual({
      low: "Fast and economical (≤512 tok)",
      med: "Balanced (≤2k tok)",
      high: "Detailed (≤6k tok)",
      xhigh: "Deep (≤16k tok)",
      max: "Relentless (up to 80% of context)",
    });
  });

  it("editado, a descrição do composer mostra o número que vale", () => {
    expect(describeEffort("med", { med: { maxTokens: 3000 } })).toBe(
      "Balanced (≤3k tok)"
    );
    expect(describeEffort("max", { max: { contextReservePercent: 60 } })).toContain(
      "up to 60% of context"
    );
  });

  it("o editor cobre os nove ajustes, sem faltar nem sobrar", () => {
    const chaves = CAMPOS_DE_ESFORCO.map((c) => c.key).sort();
    expect(chaves).toEqual(Object.keys(DEFAULT_EFFORT_CONFIGS.med).sort());

    for (const l of EFFORT_LEVELS) {
      for (const c of CAMPOS_DE_ESFORCO.filter((x) => x.tipo === "numero")) {
        const v = DEFAULT_EFFORT_CONFIGS[l][c.key] as number;
        expect(limitar(v, c), `${l}.${c.key}`).toBe(v);
      }
    }
  });

  it("gravar o valor de fábrica (ou vazio) apaga a chave; nível sem nada some", () => {
    let o = comCampo({}, "low", "maxTokens", 900);
    expect(o).toEqual({ low: { maxTokens: 900 } });
    o = comCampo(o, "low", "temperature", 0.1);
    expect(o.low).toEqual({ maxTokens: 900, temperature: 0.1 });
    o = comCampo(o, "low", "maxTokens", DEFAULT_EFFORT_CONFIGS.low.maxTokens);
    expect(o.low).toEqual({ temperature: 0.1 });
    o = comCampo(o, "low", "temperature", undefined);
    expect(o).toEqual({});
    expect(nivelEditado(o, "low")).toBe(false);
  });

  it("toggle também: igual ao de fábrica não fica gravado", () => {
    const o = comCampo({}, "high", "parallelToolCalls", false);
    expect(o).toEqual({ high: { parallelToolCalls: false } });
    expect(comCampo(o, "high", "parallelToolCalls", true)).toEqual({});
  });

  it("a linha do nível resume os números de agora", () => {
    expect(resumoDoNivel({}, "med")).toBe("≤2k tok · temperature 0.7 · 5 notes");
    expect(resumoDoNivel({ med: { temperature: -1 } }, "med")).toContain("provider temperature");
  });

  it("limitar prende no intervalo do campo", () => {
    const temp = CAMPOS_DE_ESFORCO.find((c) => c.key === "temperature")!;
    expect(limitar(5, temp)).toBe(2);
    expect(limitar(-3, temp)).toBe(-1);
  });
});

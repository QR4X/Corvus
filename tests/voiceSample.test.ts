import { describe, it, expect } from "vitest";
import { fraseDaAmostra, idiomaDaAmostra } from "../src/ui/settings/voiceSample";
import { SPEECH_LANGS } from "../src/ui/settings/tree";

describe("idiomaDaAmostra", () => {
  it("o idioma que você fala vence o do Obsidian", () => {
    expect(idiomaDaAmostra("pt", "en")).toBe("pt");
  });

  it("ditado em Auto (vazio): vale o idioma do Obsidian", () => {
    expect(idiomaDaAmostra("", "es")).toBe("es");
    expect(idiomaDaAmostra(undefined, "fr")).toBe("fr");
  });

  it("região não importa: pt-BR é pt, zh_TW sem frase cai pro inglês", () => {
    expect(idiomaDaAmostra("", "pt-BR")).toBe("pt");
    expect(idiomaDaAmostra("", "zh_TW")).toBe("en");
  });

  it("idioma sem frase passa a vez pro próximo da fila", () => {
    expect(idiomaDaAmostra("ko", "de")).toBe("de");
    expect(idiomaDaAmostra("", "")).toBe("en");
  });
});

describe("fraseDaAmostra", () => {
  it("diz o nome da voz — tocando várias seguidas, ela diz qual é qual", () => {
    expect(fraseDaAmostra("Coral", "pt")).toBe(
      "Oi! Eu sou Coral, e é assim que eu vou ler as suas respostas."
    );
    expect(fraseDaAmostra("Alloy", "en")).toBe(
      "Hi, I'm Alloy. This is how I'll read your answers out loud."
    );
  });

  it("todo idioma do ditado tem frase própria, com o nome dentro", () => {
    for (const [codigo] of SPEECH_LANGS) {
      if (!codigo) continue;
      const frase = fraseDaAmostra("Sage", codigo);
      expect(frase, codigo).toContain("Sage");
      expect(frase, codigo).not.toContain("{nome}");
      if (codigo !== "en") expect(frase, codigo).not.toBe(fraseDaAmostra("Sage", "en"));
    }
  });

  it("idioma desconhecido fala inglês", () => {
    expect(fraseDaAmostra("Ash", "xx")).toBe(fraseDaAmostra("Ash", "en"));
  });
});

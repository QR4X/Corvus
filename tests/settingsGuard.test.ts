import { describe, it, expect } from "vitest";
import { settingsReadLooksBroken as leituraSuspeita } from "../src/core/settingsGuard";

describe("quando as settings NÃO podem ser gravadas", () => {
  it("leitura boa: grava normalmente", () => {
    expect(
      leituraSuspeita({ chavesLidas: 42, arquivoExiste: true, tamanhoBruto: 900 })
    ).toBe(false);
  });

  it("primeira instalação: não há arquivo, os padrões SÃO a resposta certa", () => {
    expect(
      leituraSuspeita({ chavesLidas: 0, arquivoExiste: false, tamanhoBruto: 0 })
    ).toBe(false);
  });

  it("arquivo existe com conteúdo e não foi lido: TRAVA", () => {

    expect(
      leituraSuspeita({ chavesLidas: 0, arquivoExiste: true, tamanhoBruto: 900 })
    ).toBe(true);
  });

  it("arquivo vazio ou com um `{}` não trava — não há nada a perder", () => {
    expect(
      leituraSuspeita({ chavesLidas: 0, arquivoExiste: true, tamanhoBruto: 0 })
    ).toBe(false);
    expect(
      leituraSuspeita({ chavesLidas: 0, arquivoExiste: true, tamanhoBruto: 2 })
    ).toBe(false);
  });

  it("um JSON quebrado de qualquer tamanho trava", () => {

    expect(
      leituraSuspeita({ chavesLidas: 0, arquivoExiste: true, tamanhoBruto: 17 })
    ).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ler = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const MAIN = ler("src/main.ts");
const SESSION = ler("src/core/session.ts");

function corpo(fonte: string, assinatura: string): string {
  const i = fonte.indexOf(assinatura);
  expect(i, `sumiu: ${assinatura}`).toBeGreaterThan(-1);
  const abre = fonte.indexOf("{", i);
  let n = 0;
  for (let k = abre; k < fonte.length; k++) {
    if (fonte[k] === "{") n++;
    else if (fonte[k] === "}" && --n === 0) return fonte.slice(abre, k + 1);
  }
  return fonte.slice(abre);
}

describe("gravar as settings", () => {
  const fn = corpo(MAIN, "async saveSettings()");

  it("a escrita é protegida — ela não estoura pra fora", () => {

    expect(fn).toContain("try {");
    expect(fn).toMatch(/catch \(err\)/);
  });

  it("falhou, a pessoa é AVISADA — console não é aviso", () => {
    const pego = fn.slice(fn.indexOf("catch (err)"));
    expect(pego).toContain("new Notice(");

    expect(pego).toMatch(/lost when you reopen|se perde ao reabrir/);
  });

  it("avisa UMA vez por sequência de falhas", () => {

    expect(fn).toContain("if (!this.avisoDeSaveDado)");

    expect(fn).toContain("this.avisoDeSaveDado = false");
  });

  it("nenhum chamador precisa lembrar de tratar", () => {

    const chamadas = [...MAIN.matchAll(/void this\.saveSettings\(\)/g)].length;
    expect(chamadas).toBeGreaterThan(0);
  });
});

describe("gravar a conversa", () => {
  const avisar = corpo(SESSION, "private avisarFalhaDeGravacao(");

  it("falhou, a pessoa é avisada — a conversa está na tela, não no disco", () => {
    expect(avisar).toContain("new Notice(");
    expect(avisar).toMatch(/not on disk yet|não está em disco/);
  });

  it("uma vez por sequência, e rearma quando volta a gravar", () => {
    expect(avisar).toContain("if (this.avisoDeGravacaoDado) return;");
    expect(SESSION).toContain("this.avisoDeGravacaoDado = false;");
  });

  it("os DOIS caminhos de gravação avisam, não só um", () => {

    const usos = [...SESSION.matchAll(/this\.avisarFalhaDeGravacao\(err\)/g)];
    expect(usos.length).toBe(2);

    expect(SESSION).not.toContain('console.error("[corvus] saveChat falhou:');
    expect(SESSION).not.toContain('console.error("[corvus] gravarFundo falhou:');
  });
});

describe("a régua de tamanho", () => {
  const REGUA = ler("scripts/size-report.mjs");

  it("cada teto sai grudado na MEDIDA dele", () => {

    expect(REGUA).toMatch(/"main\.js":\s*\{\s*raw:\s*512,\s*gz:\s*260\s*\}/);
    expect(REGUA).toMatch(/"styles\.css":\s*\{\s*raw:\s*128,\s*gz:\s*45\s*\}/);
    expect(REGUA).toContain("KB raw /");
    expect(REGUA).toContain("KB gz /");
  });

  it("estourar QUALQUER uma das duas medidas conta", () => {
    expect(REGUA).toContain("overRaw");
    expect(REGUA).toContain("overGz");
    expect(REGUA).toMatch(/if \(overRaw \|\| overGz\) over = true;/);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// GRAVAÇÃO QUE FALHA TEM QUE APARECER NA TELA.
//
// As duas gravações do app rodam soltas — `void this.saveSettings()` e o
// timer da conversa. Ninguém espera o disco pra mexer num interruptor ou pra
// continuar digitando. O preço disso é que, quando a escrita falha, não há
// ninguém do outro lado da promessa: sete chamadas de `saveSettings` não
// tinham `catch` nenhum, e as duas da conversa só faziam `console.error`.
//
// O efeito era o mesmo nos dois casos: a mudança valia na tela, o arquivo não
// mudava, e a pessoa só descobria ao reabrir o Obsidian. Isto aqui prende o
// conserto — que é tratar na FUNÇÃO, não em cada chamador.

const ler = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const MAIN = ler("src/main.ts");
const SESSION = ler("src/core/session.ts");

/** O corpo de um método, do nome dele até a chave que fecha. */
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
    // Como quase todo chamador é `void`, um throw aqui vira unhandled
    // rejection: erro no console de quem desenvolve, nada pra quem usa.
    expect(fn).toContain("try {");
    expect(fn).toMatch(/catch \(err\)/);
  });

  it("falhou, a pessoa é AVISADA — console não é aviso", () => {
    const pego = fn.slice(fn.indexOf("catch (err)"));
    expect(pego).toContain("new Notice(");
    // E o aviso diz o que está em risco: a mudança se perde ao reabrir.
    expect(pego).toMatch(/lost when you reopen|se perde ao reabrir/);
  });

  it("avisa UMA vez por sequência de falhas", () => {
    // Disco cheio dispararia um aviso por interruptor tocado.
    expect(fn).toContain("if (!this.avisoDeSaveDado)");
    // E volta a avisar depois que uma gravação dá certo: aí é problema novo.
    expect(fn).toContain("this.avisoDeSaveDado = false");
  });

  it("nenhum chamador precisa lembrar de tratar", () => {
    // O tratamento mora na função. Sete `.catch` iguais seria a mesma frase
    // escrita sete vezes — e a oitava chamada esqueceria.
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
    // `saveNow` (o timer) e `gravarFundo` (conversa respondendo fora da tela).
    const usos = [...SESSION.matchAll(/this\.avisarFalhaDeGravacao\(err\)/g)];
    expect(usos.length).toBe(2);
    // E nenhum dos dois voltou pro console-e-mais-nada.
    expect(SESSION).not.toContain('console.error("[corvus] saveChat falhou:');
    expect(SESSION).not.toContain('console.error("[corvus] gravarFundo falhou:');
  });
});

describe("a régua de tamanho", () => {
  const REGUA = ler("scripts/size-report.mjs");

  it("cada teto sai grudado na MEDIDA dele", () => {
    // O relatório imprimia "(teto 260KB)" logo depois do número CRU, mas
    // comparava contra o GZIP. Numa revisão isso virou "424 contra 260,
    // estourado", quando o real era 135 de gzip contra 260. Rótulo ambíguo
    // custa acusação errada.
    expect(REGUA).toMatch(/"main\.js":\s*\{\s*raw:\s*512,\s*gz:\s*260\s*\}/);
    expect(REGUA).toMatch(/"styles\.css":\s*\{\s*raw:\s*128,\s*gz:\s*45\s*\}/);
    expect(REGUA).toContain("KB raw /");
    expect(REGUA).toContain("KB gz /");
  });

  it("estourar QUALQUER uma das duas medidas conta", () => {
    expect(REGUA).toContain("acimaRaw");
    expect(REGUA).toContain("acimaGz");
    expect(REGUA).toMatch(/if \(acimaRaw \|\| acimaGz\) over = true;/);
  });
});

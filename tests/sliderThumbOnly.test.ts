import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(__dirname, "..");
const CSS = readFileSync(join(RAIZ, "styles/main.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}

const FONTES = arquivos(join(RAIZ, "src")).map((f) => ({
  f: f.slice(RAIZ.length + 1),
  texto: readFileSync(f, "utf8"),
}));

describe("todo slider só anda pelo botão", () => {
  it("o trilho não recebe toque; o botão recebe", () => {
    expect(CSS).toMatch(/input\[type="range"\]\.corvus-slider\s*\{\s*pointer-events:\s*none;\s*\}/);
    expect(CSS).toMatch(
      /input\[type="range"\]\.corvus-slider::-webkit-slider-thumb\s*\{\s*pointer-events:\s*auto;\s*\}/
    );
  });

  it("todo <input type=range> do plugin leva a classe corvus-slider", () => {
    const sem: string[] = [];
    let achados = 0;
    for (const { f, texto } of FONTES) {
      const re = /type:\s*"range"|type="range"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(texto))) {
        achados++;

        const volta = texto.slice(Math.max(0, m.index - 400), m.index + 400);
        if (!volta.includes("corvus-slider")) sem.push(`${f}:${texto.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(achados).toBeGreaterThan(0);
    expect(sem, "slider sem corvus-slider (o trilho moveria a configuração)").toEqual([]);
  });

  it("o slider pronto do Obsidian não entra sem a mesma classe", () => {

    const sem = FONTES.filter(({ texto }) => {
      const usa = /addSlider\(|new SliderComponent\(/.exec(texto);
      return usa && !texto.slice(usa.index, usa.index + 600).includes("corvus-slider");
    }).map(({ f }) => f);
    expect(sem).toEqual([]);
  });
});

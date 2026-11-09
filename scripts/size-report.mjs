// scripts/size-report.mjs
// Régua de tamanho do plugin (Frente 0 do plano 1.0). Mede o que REALMENTE vai
// pro Obsidian (output/) em gzip + LOC da fonte. Roda no fim do build prod e
// avulso: `npm run size`. Tetos = warn (não quebram o build) até a gente firmar.

import fs from "fs";
import zlib from "zlib";
import path from "path";

const OUT = "output";

/**
 * Tetos, em KB, POR MEDIDA — e as duas medidas aparecem porque as duas
 * importam por motivos diferentes: o gzip é o que viaja na rede quando alguém
 * instala; o cru é o que o WebView do celular tem que parsear toda vez que o
 * Obsidian abre.
 *
 * Eram só os de gzip, e o relatório imprimia "(teto 260KB)" logo depois do
 * número CRU — numa revisão isso foi lido como "424 contra 260, estourado",
 * quando o real era 135 de gzip contra 260. Um rótulo ambíguo custou uma
 * acusação errada; agora cada teto sai grudado na medida dele.
 */
const BUDGET = {
  "main.js": { raw: 512, gz: 260 },
  "styles.css": { raw: 128, gz: 45 },
};

const kb = (n) => (n / 1024).toFixed(1);
const gz = (buf) => zlib.gzipSync(buf).length;

function locOf(dir, exts) {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += locOf(p, exts);
    else if (exts.some((x) => e.name.endsWith(x)))
      n += fs.readFileSync(p, "utf8").split("\n").length;
  }
  return n;
}

export function report() {
  console.log("\n— Corvus · régua de tamanho (output instalado) —");
  let over = false;
  for (const f of ["main.js", "styles.css"]) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    const g = gz(buf);
    const teto = BUDGET[f] ?? {};
    const acimaRaw = teto.raw && buf.length / 1024 > teto.raw;
    const acimaGz = teto.gz && g / 1024 > teto.gz;
    if (acimaRaw || acimaGz) over = true;
    const marca = (acima) => (acima ? " ⚠" : "");
    console.log(
      `  ${f.padEnd(11)} ` +
        `${kb(buf.length).padStart(7)} KB raw /${String(teto.raw ?? "—").padStart(4)}${marca(acimaRaw)}  ` +
        `${kb(g).padStart(6)} KB gz /${String(teto.gz ?? "—").padStart(4)}${marca(acimaGz)}`
    );
  }
  const tsLoc = locOf("src", [".ts", ".tsx"]);
  const cssLoc = fs.existsSync("styles/main.css")
    ? fs.readFileSync("styles/main.css", "utf8").split("\n").length
    : 0;
  console.log(`  fonte (nosso lado): ${tsLoc} LOC TS · ${cssLoc} linhas CSS\n`);
  return !over;
}

const isDirect = process.argv[1] && process.argv[1].endsWith("size-report.mjs");
if (isDirect) report();

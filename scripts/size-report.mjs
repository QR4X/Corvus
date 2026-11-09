import fs from "fs";
import zlib from "zlib";
import path from "path";

const OUT = "output";

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
  console.log("\n— Corvus · bundle size report (installed output) —");
  let over = false;
  for (const f of ["main.js", "styles.css"]) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    const g = gz(buf);
    const cap = BUDGET[f] ?? {};
    const overRaw = cap.raw && buf.length / 1024 > cap.raw;
    const overGz = cap.gz && g / 1024 > cap.gz;
    if (overRaw || overGz) over = true;
    const flag = (exceeded) => (exceeded ? " ⚠" : "");
    console.log(
      `  ${f.padEnd(11)} ` +
        `${kb(buf.length).padStart(7)} KB raw /${String(cap.raw ?? "—").padStart(4)}${flag(overRaw)}  ` +
        `${kb(g).padStart(6)} KB gz /${String(cap.gz ?? "—").padStart(4)}${flag(overGz)}`
    );
  }
  const tsLoc = locOf("src", [".ts", ".tsx"]);
  const cssLoc = fs.existsSync("styles/main.css")
    ? fs.readFileSync("styles/main.css", "utf8").split("\n").length
    : 0;
  console.log(`  source: ${tsLoc} LOC TS · ${cssLoc} CSS lines\n`);
  return !over;
}

const isDirect = process.argv[1] && process.argv[1].endsWith("size-report.mjs");
if (isDirect) report();

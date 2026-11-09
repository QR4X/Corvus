// scripts/preview/preview.mjs
// Preview da casca (src/ui) no browser — `npm run preview`.
//
// POR QUE ISTO EXISTE: o plugin roda DENTRO do Obsidian, e o app.css dele
// estiliza `button`, `textarea` e `input` com seletores que ganham das nossas
// classes (ex.: `button:not(.clickable-icon)` = 0,1,1 > `.corvus-chip` = 0,1,0).
// Qualquer preview com tema "aproximado" mente: mostra a UI bonita e o app
// mostra outra coisa. Então aqui a gente extrai o app.css REAL do
// obsidian.asar instalado na máquina e monta o mesmo DOM do workspace.
//
// O app.css extraído é do Obsidian (proprietário) e NÃO vai pro git — fica em
// scripts/preview/.out/, que está no .gitignore.
//
// Uso:
//   npm run preview            → serve em http://127.0.0.1:8777
//   npm run preview -- --port 9000
//
// Cenários (query string):
//   ?s=empty|thread            → tela inicial ou conversa com mensagens
//   &theme=light|dark
//   &device=mobile|desktop     → liga/desliga a classe body.is-mobile
//
// Versão do Obsidian: por padrão, o asar do INSTALADOR. O app de verdade
// carrega a atualização que ele mesmo baixa (no Windows,
// %APPDATA%/obsidian/obsidian-X.Y.Z.asar) quando ela é mais nova — pra
// desenhar com o CSS dela, aponte o arquivo:
//   npm run preview -- --asar "$APPDATA/obsidian/obsidian-1.13.7.asar"

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, ".out");

const portArg = process.argv.indexOf("--port");
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : 8777;
const asarArg = process.argv.indexOf("--asar");
const ASAR = asarArg > -1 ? process.argv[asarArg + 1] : null;

// ── 1. app.css real, de dentro do obsidian.asar ─────────────────────────────

/** Caminhos prováveis do asar por SO. */
function asarCandidates() {
  const home = os.homedir();
  switch (process.platform) {
    case "win32":
      return [
        path.join(
          process.env.LOCALAPPDATA ?? path.join(home, "AppData/Local"),
          "Programs/Obsidian/resources/obsidian.asar"
        ),
      ];
    case "darwin":
      return ["/Applications/Obsidian.app/Contents/Resources/obsidian.asar"];
    default:
      return [
        "/opt/Obsidian/resources/obsidian.asar",
        "/usr/lib/obsidian/resources/obsidian.asar",
        path.join(home, ".local/share/obsidian/resources/obsidian.asar"),
      ];
  }
}

/** Lê um arquivo de dentro de um .asar sem dependência externa. */
function readFromAsar(asarPath, name) {
  const fd = fs.openSync(asarPath, "r");
  try {
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    const headerSize = head.readUInt32LE(12);
    const hb = Buffer.alloc(headerSize);
    fs.readSync(fd, hb, 0, headerSize, 16);
    const header = JSON.parse(hb.toString("utf8").replace(/\0+$/, ""));
    const entry = header.files?.[name];
    if (!entry) throw new Error(`${name} não está no asar`);
    const buf = Buffer.alloc(entry.size);
    fs.readSync(fd, buf, 0, entry.size, 16 + headerSize + Number(entry.offset));
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

/** A versão do Obsidian dentro do asar — a mesma de onde sai o app.css. */
let obsidianVersion = "0.0.0";

function extractAppCss() {
  const target = path.join(OUT, "app.css");
  const asar = ASAR ?? asarCandidates().find((p) => fs.existsSync(p));
  if (!asar) {
    console.error(
      "[preview] obsidian.asar não encontrado. O preview SÓ vale com o CSS\n" +
        "real do app — instale o Obsidian ou aponte o caminho em asarCandidates()."
    );
    process.exit(1);
  }
  fs.writeFileSync(target, readFromAsar(asar, "app.css"));
  obsidianVersion = JSON.parse(readFromAsar(asar, "package.json").toString("utf8")).version;
  const kb = (fs.statSync(target).size / 1024).toFixed(0);
  console.log(`[preview] app.css do Obsidian ${obsidianVersion}, de ${asar} (${kb}KB)`);

  // O enhance.js é quem instala os helpers de DOM do Obsidian: os globais
  // `createEl`/`createDiv`/`createSpan`/`createFragment`; no protótipo de Node,
  // `createEl`, `createDiv`, `createSpan`, `empty`, `doc`, `win`; e no de
  // Element, `addClass`, `setText`, `setAttr`… Sem ele o preview
  // não consegue rodar código que usa esses helpers — e o plugin inteiro usa.
  // Foi o que escondeu, na 0.9.6, que o menu reescrito com `createDiv` nunca
  // tinha rodado aqui: o bundle era anterior à mudança, e mesmo rebuildado
  // teria quebrado por falta do helper. Proprietário como o app.css: vai pro
  // .out/, que não é versionado.
  fs.writeFileSync(path.join(OUT, "enhance.js"), readFromAsar(asar, "enhance.js"));
  console.log("[preview] enhance.js extraído (helpers de DOM do Obsidian)");
}

// ── 2. bundle da casca com o stub da API ────────────────────────────────────

async function bundle() {
  await esbuild.build({
    stdin: {
      contents: fs.readFileSync(path.join(HERE, "entry.tsx"), "utf8"),
      resolveDir: ROOT,
      loader: "tsx",
      sourcefile: "entry.tsx",
    },
    bundle: true,
    outfile: path.join(OUT, "bundle.js"),
    format: "iife",
    jsx: "automatic",
    target: "es2020",
    alias: { obsidian: path.join(HERE, "obsidian-stub.ts") },
    define: {
      "process.env.NODE_ENV": '"development"',
      // `requireApiVersion` do stub responde por ESTA versão: o CSS do preview
      // é o dela, então a lógica que escolhe classe por versão tem de bater.
      PREVIEW_OBSIDIAN_VERSION: JSON.stringify(obsidianVersion),
      PREVIEW_VERSION: JSON.stringify(
        JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"))
          .version
      ),
    },
    logLevel: "warning",
  });
  fs.copyFileSync(path.join(ROOT, "styles/main.css"), path.join(OUT, "main.css"));
  fs.copyFileSync(path.join(HERE, "index.html"), path.join(OUT, "index.html"));
  fs.copyFileSync(
    path.join(ROOT, "node_modules/lucide/dist/umd/lucide.js"),
    path.join(OUT, "lucide.js")
  );
}

// ── 3. servidor estático ────────────────────────────────────────────────────

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function serve() {
  http
    .createServer((req, res) => {
      const rel = (req.url ?? "/").split("?")[0];
      // O CSS sai do DISCO, não da cópia: mexer em styles/main.css passa a
      // valer com um reload, sem reiniciar o preview (o bundle .js continua
      // exigindo restart — aquele precisa de build). Só ESTE caminho escapa
      // do OUT; o resto continua preso lá dentro.
      const live = rel === "/main.css" ? path.join(ROOT, "styles/main.css") : null;
      const file = live ?? path.join(OUT, rel === "/" ? "index.html" : rel);
      if ((!live && !file.startsWith(OUT)) || !fs.existsSync(file)) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(file).pipe(res);
    })
    .listen(PORT, "127.0.0.1", () => {
      console.log(`[preview] http://127.0.0.1:${PORT}/?s=empty`);
      console.log(`[preview] http://127.0.0.1:${PORT}/?s=thread&theme=light`);
      console.log("[preview] Ctrl+C pra parar.");
    });
}

fs.mkdirSync(OUT, { recursive: true });
extractAppCss();
await bundle();
serve();

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
    if (!entry) throw new Error(`${name} is not in asar`);
    const buf = Buffer.alloc(entry.size);
    fs.readSync(fd, buf, 0, entry.size, 16 + headerSize + Number(entry.offset));
    return buf;
  } finally {
    fs.closeSync(fd);
  }
}

let obsidianVersion = "0.0.0";

function extractAppCss() {
  const target = path.join(OUT, "app.css");
  const asar = ASAR ?? asarCandidates().find((p) => fs.existsSync(p));
  if (!asar) {
    console.error(
      "[preview] obsidian.asar not found. Install Obsidian or pass --asar."
    );
    process.exit(1);
  }
  fs.writeFileSync(target, readFromAsar(asar, "app.css"));
  obsidianVersion = JSON.parse(readFromAsar(asar, "package.json").toString("utf8")).version;
  const kb = (fs.statSync(target).size / 1024).toFixed(0);
  console.log(`[preview] Obsidian ${obsidianVersion} app.css from ${asar} (${kb}KB)`);

  fs.writeFileSync(path.join(OUT, "enhance.js"), readFromAsar(asar, "enhance.js"));
  console.log("[preview] enhance.js extracted (Obsidian DOM helpers)");
}

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

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function serve() {
  http
    .createServer((req, res) => {
      const rel = (req.url ?? "/").split("?")[0];

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
      console.log("[preview] Ctrl+C to stop.");
    });
}

fs.mkdirSync(OUT, { recursive: true });
extractAppCss();
await bundle();
serve();

import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";
// builtinModules vem do próprio Node desde o 9.3 — não precisa de pacote.
import { builtinModules as builtins } from "node:module";
import { report } from "./scripts/size-report.mjs";
import { parteCurta } from "./scripts/chaveCurta.mjs";

const prod = process.argv[2] === "production";

// Copia manifest + CSS pro output/. Em prod o CSS é MINIFICADO (o que vai pro
// Obsidian é espremido; a fonte styles/main.css segue legível do nosso lado).
// main.js + manifest.json + styles.css = o pacote que o Obsidian carrega.
async function syncAssets() {
  fs.mkdirSync("output", { recursive: true });
  fs.copyFileSync("manifest.json", path.join("output", "manifest.json"));
  const css = fs.readFileSync(path.join("styles", "main.css"), "utf8");
  const outCss = prod
    ? (await esbuild.transform(css, { loader: "css", minify: true })).code
    : css;
  fs.writeFileSync(path.join("output", "styles.css"), outCss);
}

/**
 * O dicionário pt-BR com CHAVES CURTAS: cada parte (src/i18n/ui-pt/*.ts, menos
 * o index) troca as chaves em inglês pela chave curta (scripts/chaveCurta.mjs).
 * A frase em inglês já está no código, no tr("…") que a mostra; repetida como
 * chave, era ~30 KB a mais. Dois textos com a mesma chave param o build.
 */
const vistasNoDicionario = new Map();
const dicionarioCurto = {
  name: "corvus-dicionario-curto",
  setup(build) {
    build.onStart(() => vistasNoDicionario.clear());
    // O filtro do esbuild é regex do Go (sem lookahead): o index, que só
    // junta as partes, sai aqui dentro.
    build.onLoad({ filter: /[\\/]src[\\/]i18n[\\/]ui-pt[\\/][^\\/]+\.ts$/ }, async (args) => {
      if (/[\\/]index\.ts$/.test(args.path)) return undefined;
      const ts = await fs.promises.readFile(args.path, "utf8");
      const { codigo } = await parteCurta(ts, args.path, vistasNoDicionario);
      return { contents: codigo, loader: "js" };
    });
  },
};

const copyAssetsPlugin = {
  name: "corvus-copy-assets",
  setup(build) {
    build.onStart(async () => {
      await syncAssets();
    });
    build.onEnd(async (result) => {
      if (result.errors.length === 0) await syncAssets();
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // Frente 1 (base 1.0): troca React+ReactDOM por Preact/compat SÓ no bundle que
  // vai pro Obsidian. Types e testes (vitest) seguem no React real — o alias é só
  // do esbuild. ~40KB gz a menos. APIs usadas (createPortal/useId/useLayoutEffect)
  // são cobertas pelo compat.
  alias: {
    react: "preact/compat",
    "react-dom": "preact/compat",
    // createRoot do React 18 não existe no preact/compat → shim sobre render().
    "react-dom/client": path.resolve("src/shims/reactDomClient.ts"),
    "react/jsx-runtime": "preact/jsx-runtime",
  },
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  // ES2021: o próprio Obsidian (1.12, 1.13) já usa `?.`, `??` e `??=` no
  // app.js — todo aparelho que roda o Obsidian roda isto. No es2018 cada um
  // virava uma expressão longa: ~15 KB a mais.
  target: "es2021",
  // UTF-8 de verdade: no padrão (ascii) cada "ç", "—" e "·" virava \uXXXX,
  // seis bytes em vez de dois. O Obsidian lê o main.js como UTF-8.
  charset: "utf8",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  // Output espremido: sem console/debugger nem comentário legal no que vai pro
  // Obsidian (menor + mais difícil de copiar). A fonte mantém os logs.
  drop: prod ? ["console", "debugger"] : [],
  legalComments: "none",
  outfile: "output/main.js",
  plugins: [dicionarioCurto, copyAssetsPlugin],
});

if (prod) {
  await context.rebuild();
  await context.dispose();
  report();
  process.exit(0);
} else {
  await context.watch();
}

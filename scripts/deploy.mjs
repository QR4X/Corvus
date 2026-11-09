import fs from "node:fs";
import path from "node:path";

const CONFIG_FILE = ".corvus.local.json";
const PLUGIN_FOLDER = "corvus";
const FILES = ["main.js", "manifest.json", "styles.css"];

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`
[deploy] ${CONFIG_FILE} not found.

Create this file at the project root with the path to your Obsidian vault:

  {
    "vaultPath": "/path/to/MyVault"
  }
`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CONFIG_FILE, "utf8");
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    console.error(`[deploy] ${CONFIG_FILE} is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  if (!config.vaultPath) {
    console.error(`[deploy] "vaultPath" is not defined in ${CONFIG_FILE}.`);
    process.exit(1);
  }
  if (!fs.existsSync(config.vaultPath)) {
    console.error(`[deploy] vaultPath does not exist: ${config.vaultPath}`);
    process.exit(1);
  }
  return config;
}

function copyToVault(vaultPath) {
  const targetDir = path.join(vaultPath, ".obsidian", "plugins", PLUGIN_FOLDER);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const file of FILES) {
    const src = path.join("output", file);
    const dest = path.join(targetDir, file);
    if (!fs.existsSync(src)) {
      console.error(`[deploy] ${src} does not exist. Run 'npm run build' first.`);
      process.exit(1);
    }
    fs.copyFileSync(src, dest);
    console.log(`[deploy] ${file} -> ${dest}`);
  }
  return targetDir;
}

const config = readConfig();
const targetDir = copyToVault(config.vaultPath);
console.log(`\n[deploy] Completed in ${targetDir}`);
console.log("[deploy] Reload the plugin in Obsidian: Settings -> Community plugins -> toggle off/on.");

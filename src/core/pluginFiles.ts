import type { App, PluginManifest } from "obsidian";

export function pluginFile(app: App, manifest: PluginManifest, name: string): string {
  const dir = manifest.dir ?? `${app.vault.configDir}/plugins/${manifest.id}`;
  return `${dir}/${name}`;
}

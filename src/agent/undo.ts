import { TFile, TFolder, type App, type TAbstractFile } from "obsidian";
import { tr } from "../i18n/tr";

export class ConflitoAoDesfazer extends Error {}

export interface Desfazer {

  executar(forcar?: boolean): Promise<string>;
}

type Antes =
  | { tool: "vault_create"; path: string }
  | { tool: "vault_edit"; path: string; conteudo: string }
  | { tool: "vault_move"; from: string; to: string }
  | { tool: "vault_delete"; path: string; pasta: true }
  | { tool: "vault_delete"; path: string; pasta: false; bytes: ArrayBuffer }
  | { tool: "vault_create_folder"; path: string };

const MAX_COPIA_BYTES = 20 * 1024 * 1024;

function limpo(p: unknown): string {
  return (typeof p === "string" ? p : "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function pai(p: string): string {
  return p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
}

async function garantirPasta(app: App, pasta: string): Promise<void> {
  if (!pasta || app.vault.getAbstractFileByPath(pasta)) return;
  await garantirPasta(app, pai(pasta));
  await app.vault.createFolder(pasta);
}

export function lixeiraDoVault(app: App): "system" | "local" | "none" | null {
  const vault = app.vault as unknown as { getConfig?: (k: string) => unknown };
  try {
    const v = vault.getConfig?.("trashOption");
    return v === "system" || v === "local" || v === "none" ? v : null;
  } catch {
    return null;
  }
}

export function apagarVaiPraLixeira(app: App): boolean {
  const l = lixeiraDoVault(app);
  return l === "system" || l === "local";
}

export async function antesDe(
  app: App,
  name: string,
  args: Record<string, unknown>
): Promise<Antes | null> {
  switch (name) {
    case "vault_create":
      return { tool: name, path: limpo(args.path) };
    case "vault_edit": {
      const path = limpo(args.path);
      const f = app.vault.getAbstractFileByPath(path);
      if (!(f instanceof TFile)) return null;
      return { tool: name, path, conteudo: await app.vault.read(f) };
    }
    case "vault_move":
      return { tool: name, from: limpo(args.from), to: limpo(args.to) };
    case "vault_delete": {
      const path = limpo(args.path);
      const f = app.vault.getAbstractFileByPath(path);
      if (f instanceof TFolder) return { tool: name, path, pasta: true };
      if (!(f instanceof TFile)) return null;
      if ((f.stat?.size ?? 0) > MAX_COPIA_BYTES) return null;

      return { tool: name, path, pasta: false, bytes: await app.vault.readBinary(f) };
    }
    case "vault_create_folder": {
      const path = limpo(args.path);

      if (app.vault.getAbstractFileByPath(path)) return null;
      return { tool: name, path };
    }
    default:
      return null;
  }
}

async function textoDe(app: App, path: string): Promise<{ f: TFile; texto: string } | null> {
  const f = app.vault.getAbstractFileByPath(path);
  if (!(f instanceof TFile)) return null;
  return { f, texto: await app.vault.read(f) };
}

export async function depoisDe(app: App, antes: Antes): Promise<Desfazer | null> {
  switch (antes.tool) {
    case "vault_create": {
      const agora = await textoDe(app, antes.path);
      if (!agora) return null;
      const escrito = agora.texto;
      return {
        async executar(forcar) {
          const atual = await textoDe(app, antes.path);
          if (!atual) throw new Error(tr("{path} no longer exists.", { path: antes.path }));
          if (atual.texto !== escrito && !forcar) {
            throw new ConflitoAoDesfazer(
              tr("{path} changed after the agent created it.", { path: antes.path })
            );
          }
          await app.fileManager.trashFile(atual.f);
          return tr("Removed {path}", { path: antes.path });
        },
      };
    }
    case "vault_edit": {
      const agora = await textoDe(app, antes.path);
      if (!agora) return null;
      const escrito = agora.texto;
      return {
        async executar(forcar) {
          const atual = await textoDe(app, antes.path);
          if (!atual) throw new Error(tr("{path} no longer exists.", { path: antes.path }));
          if (atual.texto !== escrito && !forcar) {
            throw new ConflitoAoDesfazer(
              tr("{path} changed after the agent's edit.", { path: antes.path })
            );
          }
          await app.vault.process(atual.f, () => antes.conteudo);
          return tr("Restored {path}", { path: antes.path });
        },
      };
    }
    case "vault_move":
      return {
        async executar() {
          const alvo: TAbstractFile | null = app.vault.getAbstractFileByPath(antes.to);
          if (!alvo) throw new Error(tr("Nothing at {path} anymore.", { path: antes.to }));
          if (app.vault.getAbstractFileByPath(antes.from)) {
            throw new Error(tr("{path} is taken now — move it by hand.", { path: antes.from }));
          }
          await garantirPasta(app, pai(antes.from));

          await app.fileManager.renameFile(alvo, antes.from);
          return tr("Moved back to {path}", { path: antes.from });
        },
      };
    case "vault_delete":
      return {
        async executar() {
          if (app.vault.getAbstractFileByPath(antes.path)) {
            throw new Error(
              tr("{path} exists again — nothing to restore over.", { path: antes.path })
            );
          }
          await garantirPasta(app, pai(antes.path));
          if (antes.pasta) {
            await app.vault.createFolder(antes.path);
          } else {
            await app.vault.createBinary(antes.path, antes.bytes);
          }
          return tr("Restored {path}", { path: antes.path });
        },
      };
    case "vault_create_folder":
      return {
        async executar() {
          const d = app.vault.getAbstractFileByPath(antes.path);
          if (!(d instanceof TFolder)) {
            throw new Error(tr("{path} no longer exists.", { path: antes.path }));
          }

          if (d.children.length > 0) {
            throw new Error(tr("{path} has files in it now.", { path: antes.path }));
          }
          await app.fileManager.trashFile(d);
          return tr("Removed folder {path}", { path: antes.path });
        },
      };
  }
}

const registro = new Map<string, Desfazer>();

export function registrarDesfazer(id: string, d: Desfazer): void {
  registro.set(id, d);
}

export function podeDesfazer(id: string | undefined): boolean {
  return !!id && registro.has(id);
}

export async function desfazer(id: string, forcar = false): Promise<string> {
  const d = registro.get(id);
  if (!d) throw new Error(tr("This change can no longer be undone."));
  const feito = await d.executar(forcar);
  registro.delete(id);
  return feito;
}

export function esquecerDesfazeres(): void {
  registro.clear();
}

import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => import("./obsidian-stub"));

const { isSkillFilePath, skillsFolderPrefix } = await import(
  "../src/skills/skills"
);

describe("isSkillFilePath — gate do hot reload das skills", () => {
  const FOLDER = "corvus-ai/skills";

  it("aceita .md dentro da pasta (inclusive em subpasta)", () => {
    expect(isSkillFilePath("corvus-ai/skills/Resumo.md", FOLDER)).toBe(true);
    expect(isSkillFilePath("corvus-ai/skills/pt/Resumo.md", FOLDER)).toBe(true);
  });

  it("recusa nota fora da pasta", () => {
    expect(isSkillFilePath("Notas/Resumo.md", FOLDER)).toBe(false);
    expect(isSkillFilePath("corvus-ai/chats/2026-08-03.md", FOLDER)).toBe(false);
  });

  it("recusa arquivo que não é .md (anexo, índice, gravação)", () => {
    expect(isSkillFilePath("corvus-ai/skills/logo.png", FOLDER)).toBe(false);
    expect(isSkillFilePath("corvus-ai/skills/index.json", FOLDER)).toBe(false);
  });

  it("recusa pasta vizinha com o mesmo prefixo de nome", () => {
    expect(isSkillFilePath("corvus-ai/skills-old/Resumo.md", FOLDER)).toBe(false);
  });

  it("extensão maiúscula ainda conta como skill", () => {
    expect(isSkillFilePath("corvus-ai/skills/Resumo.MD", FOLDER)).toBe(true);
  });

  it("path vazio nunca dispara reload", () => {
    expect(isSkillFilePath("", FOLDER)).toBe(false);
  });

  it("pasta customizada (com barra sobrando) é normalizada", () => {
    expect(isSkillFilePath("Minhas Skills/a.md", "Minhas Skills/")).toBe(true);
    expect(skillsFolderPrefix("Minhas Skills/")).toBe("Minhas Skills/");
  });

  it("pasta vazia cai no default do produto", () => {
    expect(skillsFolderPrefix("")).toBe("corvus-ai/skills/");
    expect(isSkillFilePath("corvus-ai/skills/a.md", "")).toBe(true);
  });
});

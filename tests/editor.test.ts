import { describe, expect, it } from "vitest";
import { joinContinuation, cleanReply, actionMessages, LanguageModal } from "../src/editor/inline";
import { clearRequests, listenForRequests, sendToPanel, type EditorRequest } from "../src/editor/bridge";
import { registerEditorCommands, SUMMARIZE_REQUEST } from "../src/editor/commands";
import type CorvusPlugin from "../src/main";

describe("ações no texto", () => {
  it("cada ação pede só o texto de volta; tradução nomeia o idioma", () => {
    for (const acao of ["rewrite", "fix", "translate", "continue"] as const) {
      const [sistema, usuario] = actionMessages(acao, "olá", { language: "Japanese" });
      expect(sistema.role).toBe("system");
      expect(sistema.content).toMatch(/ONLY the resulting text/);
      expect(usuario).toEqual({ role: "user", content: "olá" });
    }
    expect(actionMessages("translate", "x", { language: "Japanese" })[0].content).toMatch(/into Japanese/);
    expect(actionMessages("rewrite", "x")[0].content).toMatch(/Keep its meaning, tone and language/);
  });

  it("limpa a cerca de código e as aspas em volta da resposta inteira", () => {
    expect(cleanReply("```markdown\nTexto novo.\n```")).toBe("Texto novo.");
    expect(cleanReply('"Texto novo."')).toBe("Texto novo.");
    expect(cleanReply("“Texto novo.”")).toBe("Texto novo.");

    expect(cleanReply('"um" e "dois"')).toBe('"um" e "dois"');
    expect(cleanReply("  normal \r\n")).toBe("normal");
  });

  it("emendar: espaço só quando nenhum lado tem branco", () => {
    expect(joinContinuation("Era uma vez", "um gato.")).toBe(" um gato.");
    expect(joinContinuation("Fim.\n", "Outro parágrafo.")).toBe("Outro parágrafo.");
    expect(joinContinuation("Fim.", "\n\nOutro.")).toBe("\n\nOutro.");
  });

  it("o idioma digitado que não está na lista vira a primeira opção", () => {
    const m = new LanguageModal({} as never, () => {});
    expect(m.modalEl.hasClass("corvus-language-modal")).toBe(true);
    expect(m.getSuggestions("port")).toEqual(["port", "Portuguese (Brazil)", "Portuguese (Portugal)"]);
    expect(m.getSuggestions("Spanish")).toEqual(["Spanish"]);
    expect(m.getSuggestions("").length).toBeGreaterThan(10);
  });
});

describe("a ponte editor → painel", () => {
  it("pedido sem painel espera na fila; o painel, ao montar, recebe", () => {
    clearRequests();
    const recebidos: EditorRequest[] = [];
    sendToPanel({ kind: "note", path: "a.md" });
    sendToPanel({ kind: "selection", path: "b.md", text: "x" });
    const parar = listenForRequests((p) => recebidos.push(p));
    expect(recebidos.map((p) => p.kind)).toEqual(["note", "selection"]);

    sendToPanel({ kind: "note", path: "c.md", send: SUMMARIZE_REQUEST });
    expect(recebidos).toHaveLength(3);
    parar();
    sendToPanel({ kind: "note", path: "d.md" });
    expect(recebidos).toHaveLength(3); 
    clearRequests();
  });
});

describe("os comandos", () => {
  it("registra os sete comandos e os dois menus", () => {
    const comandos: Array<{ id: string; name: string }> = [];
    const eventos: string[] = [];
    const plugin = {
      app: { workspace: { getActiveFile: () => null, on: (nome: string) => (eventos.push(nome), {}) } },
      addCommand: (c: { id: string; name: string }) => comandos.push(c),
      registerEvent: () => {},
      activateView: async () => {},
    } as unknown as CorvusPlugin;
    registerEditorCommands(plugin);
    expect(comandos.map((c) => c.id)).toEqual([
      "ask-about-note",
      "summarize-note",
      "send-selection-to-chat",
      "rewrite-selection",
      "fix-selection",
      "translate-selection",
      "continue-writing",
    ]);

    expect(comandos.every((c) => !/corvus/i.test(c.name))).toBe(true);
    expect(eventos).toEqual(["editor-menu", "file-menu"]);
  });
});

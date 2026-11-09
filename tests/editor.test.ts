import { describe, expect, it } from "vitest";
import { emendar, limparResposta, mensagensDaAcao, IdiomaModal } from "../src/editor/inline";
import { esquecerPedidos, ouvirPedidos, pedirAoPainel, type PedidoDoEditor } from "../src/editor/ponte";
import { registrarComandosDoEditor, PEDIDO_RESUMO } from "../src/editor/comandos";
import type CorvusPlugin from "../src/main";

// O Corvus a partir da nota: as instruções de cada ação no texto, a limpeza da
// resposta, a ponte editor → painel e os comandos registrados.

describe("ações no texto", () => {
  it("cada ação pede só o texto de volta; tradução nomeia o idioma", () => {
    for (const acao of ["rewrite", "fix", "translate", "continue"] as const) {
      const [sistema, usuario] = mensagensDaAcao(acao, "olá", { idioma: "Japanese" });
      expect(sistema.role).toBe("system");
      expect(sistema.content).toMatch(/ONLY the resulting text/);
      expect(usuario).toEqual({ role: "user", content: "olá" });
    }
    expect(mensagensDaAcao("translate", "x", { idioma: "Japanese" })[0].content).toMatch(/into Japanese/);
    expect(mensagensDaAcao("rewrite", "x")[0].content).toMatch(/Keep its meaning, tone and language/);
  });

  it("limpa a cerca de código e as aspas em volta da resposta inteira", () => {
    expect(limparResposta("```markdown\nTexto novo.\n```")).toBe("Texto novo.");
    expect(limparResposta('"Texto novo."')).toBe("Texto novo.");
    expect(limparResposta("“Texto novo.”")).toBe("Texto novo.");
    // aspas no MEIO não são embrulho
    expect(limparResposta('"um" e "dois"')).toBe('"um" e "dois"');
    expect(limparResposta("  normal \r\n")).toBe("normal");
  });

  it("emendar: espaço só quando nenhum lado tem branco", () => {
    expect(emendar("Era uma vez", "um gato.")).toBe(" um gato.");
    expect(emendar("Fim.\n", "Outro parágrafo.")).toBe("Outro parágrafo.");
    expect(emendar("Fim.", "\n\nOutro.")).toBe("\n\nOutro.");
  });

  it("o idioma digitado que não está na lista vira a primeira opção", () => {
    const m = new IdiomaModal({} as never, () => {});
    expect(m.modalEl.hasClass("corvus-language-modal")).toBe(true);
    expect(m.getSuggestions("port")).toEqual(["port", "Portuguese (Brazil)", "Portuguese (Portugal)"]);
    expect(m.getSuggestions("Spanish")).toEqual(["Spanish"]);
    expect(m.getSuggestions("").length).toBeGreaterThan(10);
  });
});

describe("a ponte editor → painel", () => {
  it("pedido sem painel espera na fila; o painel, ao montar, recebe", () => {
    esquecerPedidos();
    const recebidos: PedidoDoEditor[] = [];
    pedirAoPainel({ tipo: "nota", path: "a.md" });
    pedirAoPainel({ tipo: "trecho", path: "b.md", texto: "x" });
    const parar = ouvirPedidos((p) => recebidos.push(p));
    expect(recebidos.map((p) => p.tipo)).toEqual(["nota", "trecho"]);
    // com o painel montado, chega na hora
    pedirAoPainel({ tipo: "nota", path: "c.md", enviar: PEDIDO_RESUMO });
    expect(recebidos).toHaveLength(3);
    parar();
    pedirAoPainel({ tipo: "nota", path: "d.md" });
    expect(recebidos).toHaveLength(3); // parou de ouvir: volta pra fila
    esquecerPedidos();
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
    registrarComandosDoEditor(plugin);
    expect(comandos.map((c) => c.id)).toEqual([
      "ask-about-note",
      "summarize-note",
      "send-selection-to-chat",
      "rewrite-selection",
      "fix-selection",
      "translate-selection",
      "continue-writing",
    ]);
    // nome sem o do plugin: a paleta já prefixa "Corvus:"
    expect(comandos.every((c) => !/corvus/i.test(c.name))).toBe(true);
    expect(eventos).toEqual(["editor-menu", "file-menu"]);
  });
});

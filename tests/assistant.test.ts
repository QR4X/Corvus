import { describe, it, expect } from "vitest";
import {
  isFree,
  pickAssistant,
  unavailableReason,
} from "../src/assistant/model";
import { isZeroPrice } from "../src/providers/openrouterFree";
import {
  parseObject,
  parseProject,
  parseSkill,
  parseQuestion,
  parseText,
  extractJson,
} from "../src/assistant/parse";
import {
  promptDescription,
  promptInstructions,
  promptProject,
  promptSkill,
} from "../src/assistant/prompt";

const ICONES = ["folder", "graduation-cap", "plane"];
const CORES = ["default", "#e5484d", "#4361ee"];

describe("escolherAssistente", () => {
  it("a escolha explícita manda", () => {
    expect(
      pickAssistant({
        assistantProvider: "openai",
        assistantModel: "gpt-5",
        favoriteModels: { openrouter: ["x/y:free"] },
      })
    ).toEqual({ provider: "openai", model: "gpt-5" });
  });

  it("sem escolha, pega o FAVORITO free do OpenRouter", () => {

    expect(
      pickAssistant({
        favoriteModels: { openrouter: ["pago/modelo", "meta/llama:free"] },
        activeModels: { openrouter: ["outro/coisa:free"] },
      })
    ).toEqual({ provider: "openrouter", model: "meta/llama:free" });
  });

  it("sem favorito free, cai pros modelos conhecidos", () => {
    expect(
      pickAssistant({
        favoriteModels: { openrouter: ["pago/modelo"] },
        activeModels: { openrouter: ["pago/outro", "x/y:free"] },
      })
    ).toEqual({ provider: "openrouter", model: "x/y:free" });
  });

  it("sem nada servível, devolve null — que é convite, não erro", () => {
    expect(pickAssistant({})).toBeNull();
    expect(
      pickAssistant({ activeModels: { openrouter: ["só/pago"] } })
    ).toBeNull();
  });

  it("free é o sufixo, como no resto do app", () => {
    expect(isFree("meta/llama:free")).toBe(true);
    expect(isFree("meta/llama")).toBe(false);
  });
});

describe("motivoIndisponivel", () => {
  it("sem modelo e sem chave dizem coisas DIFERENTES", () => {

    const semModelo = unavailableReason(null, () => true);
    const semChave = unavailableReason(
      { provider: "openrouter", model: "x:free" },
      () => false
    );
    expect(semModelo).toMatch(/model/i);
    expect(semChave).toMatch(/key/i);
    expect(semModelo).not.toBe(semChave);
  });

  it("com modelo e chave, não há motivo", () => {
    expect(
      unavailableReason({ provider: "openrouter", model: "x:free" }, () => true)
    ).toBeNull();
  });
});

describe("recortarJson", () => {
  it("tira a cerca de código", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("acha o objeto no meio da prosa", () => {

    expect(extractJson('Sure! {"a":1} Hope that helps.')).toBe('{"a":1}');
  });

  it("sem objeto nenhum, devolve null em vez de lançar", () => {
    expect(extractJson("desculpa, não entendi")).toBeNull();
    expect(parseObject("desculpa")).toBeNull();
  });

  it("JSON quebrado não derruba nada", () => {
    expect(parseObject('{"a": }')).toBeNull();
  });
});

describe("lerSkill", () => {
  const ok = {
    name: "Weekly review",
    description: "Go through the week",
    icon: "graduation-cap",
    color: "#4361ee",
    mode: "vault-qa",
    body: "Go through this week's notes and tell me what moved.",
  };

  it("passa o que é válido", () => {
    expect(parseSkill(ok, ICONES, "folder", CORES)).toEqual(ok);
  });

  it("skill também tem cor, e fora da paleta vira default", () => {

    expect(parseSkill({ ...ok, color: "roxo" }, ICONES, "folder", CORES)?.color).toBe(
      "default"
    );

    expect(parseSkill(ok, ICONES, "folder")?.color).toBe("default");
  });

  it("ícone inventado vira o padrão, e não um buraco na tela", () => {
    const r = parseSkill({ ...ok, icon: "sparkles-2" }, ICONES, "folder", CORES);
    expect(r?.icon).toBe("folder");
  });

  it("modo inventado vira vazio (abre onde a pessoa estiver)", () => {
    expect(parseSkill({ ...ok, mode: "wizard" }, ICONES, "folder", CORES)?.mode).toBe("");
    expect(parseSkill({ ...ok, mode: "agent" }, ICONES, "folder", CORES)?.mode).toBe(
      "agent"
    );
  });

  it("sem corpo não é skill", () => {

    expect(parseSkill({ ...ok, body: "" }, ICONES, "folder", CORES)).toBeNull();
    expect(parseSkill({ ...ok, body: 42 }, ICONES, "folder", CORES)).toBeNull();
  });

  it("corpo cercado de crase entra limpo", () => {
    const r = parseSkill({ ...ok, body: "```\nfaz isso\n```" }, ICONES, "folder", CORES);
    expect(r?.body).toBe("faz isso");
  });

  it("nome quilométrico não estoura o campo", () => {
    const r = parseSkill({ ...ok, name: "a".repeat(300) }, ICONES, "folder", CORES);
    expect(r!.name.length).toBeLessThanOrEqual(60);
  });
});

describe("lerProjeto", () => {
  const vault = ["Refs/Kuhn.md", "Diário/2026-09.md", "Ideias.md"];
  const ok = {
    name: "Tese",
    icon: "graduation-cap",
    color: "#4361ee",
    instructions: "Sempre citar a fonte.",
    notes: ["Refs/Kuhn.md"],
  };

  it("passa o que é válido", () => {
    expect(parseProject(ok, ICONES, CORES, vault)).toEqual(ok);
  });

  it("nota inventada é DESCARTADA", () => {

    const r = parseProject(
      { ...ok, notes: ["Refs/Kuhn.md", "Projects/Tese.md"] },
      ICONES,
      CORES,
      vault
    );
    expect(r?.notes).toEqual(["Refs/Kuhn.md"]);
  });

  it("nota repetida entra uma vez só", () => {
    const r = parseProject(
      { ...ok, notes: ["Ideias.md", "Ideias.md"] },
      ICONES,
      CORES,
      vault
    );
    expect(r?.notes).toEqual(["Ideias.md"]);
  });

  it("cor fora da paleta vira o padrão", () => {
    expect(parseProject({ ...ok, color: "red" }, ICONES, CORES, vault)?.color).toBe(
      "default"
    );
  });

  it("sem nome não é projeto", () => {
    expect(parseProject({ ...ok, name: "  " }, ICONES, CORES, vault)).toBeNull();
  });

  it("`notes` que não é lista não quebra", () => {
    expect(
      parseProject({ ...ok, notes: "Refs/Kuhn.md" }, ICONES, CORES, vault)?.notes
    ).toEqual([]);
  });

  it("instrução vazia é válida — nem todo projeto tem o que dizer", () => {
    const r = parseProject({ ...ok, instructions: "" }, ICONES, CORES, vault);
    expect(r?.instructions).toBe("");
  });
});

describe("lerPergunta", () => {
  it("devolve a pergunta do modo guiado", () => {
    expect(parseQuestion({ ask: "Pra que você usa isso?" })).toBe(
      "Pra que você usa isso?"
    );
  });

  it("sem pergunta, string vazia", () => {
    expect(parseQuestion({ draft: {} })).toBe("");
    expect(parseQuestion(null)).toBe("");
  });
});

describe("os prompts", () => {
  it("o de skill leva os ícones permitidos", () => {
    const p = promptSkill("direct", ICONES, CORES);
    expect(p).toContain("graduation-cap");
    expect(p).toContain("Do not ask questions");
  });

  it("o guiado permite perguntar, com teto", () => {
    expect(promptSkill("guided", ICONES, CORES)).toMatch(/up to 3/i);
  });

  it("sem notas, ele MANDA devolver lista vazia", () => {

    const p = promptProject("direct", ICONES, CORES, []);
    expect(p).toContain('"notes": []');
    expect(p).not.toContain("Notes in this vault");
  });

  it("com notas, elas vão exatas", () => {
    const p = promptProject("direct", ICONES, CORES, ["A/b.md"]);
    expect(p).toContain("- A/b.md");
  });
});

describe("um campo só", () => {
  it("a descrição leva o prompt como matéria-prima", () => {

    const p = promptDescription({ name: "Weekly review", body: "Go through…" });
    expect(p).toContain("Weekly review");
    expect(p).toContain("Go through…");
    expect(p).toContain('{"text": "..."}');
  });

  it("as instruções levam o projeto e as notas anexadas", () => {
    const p = promptInstructions({
      name: "Tese",
      notes: ["Refs/Kuhn.md"],
      current: "",
    });
    expect(p).toContain("Project: Tese");
    expect(p).toContain("- Refs/Kuhn.md");

    expect(p).toMatch(/ADD to how the app already works/);
  });

  it("o que já está escrito vai junto pra ser MELHORADO", () => {

    const p = promptInstructions({
      name: "Tese",
      notes: [],
      current: "Sempre citar a fonte.",
    });
    expect(p).toContain("Sempre citar a fonte.");
    expect(p).toMatch(/improve on it/i);
  });

  it("campo vazio não manda uma seção vazia", () => {
    const p = promptInstructions({ name: "Tese", notes: [], current: "   " });
    expect(p).not.toMatch(/improve on it/i);
    expect(p).not.toContain("Notes already attached");
  });

  it("lerTexto respeita o teto e limpa a cerca", () => {
    expect(parseText({ text: "```\noi\n```" }, 140)).toBe("oi");
    expect(parseText({ text: "a".repeat(500) }, 140).length).toBe(140);
    expect(parseText({ text: 42 }, 140)).toBe("");
    expect(parseText(null, 140)).toBe("");
  });
});

describe("the language", () => {
  it("all prompts instruct writing in the app language", () => {
    const todos = [
      promptSkill("direct", ICONES, CORES),
      promptProject("direct", ICONES, CORES, []),
      promptDescription({ name: "x", body: "y" }),
      promptInstructions({
        name: "x",
        notes: [],
        current: "",
      }),
    ];
    for (const p of todos) {
      expect(p).toContain("Write EVERY field in English");
      expect(p).not.toMatch(/same language the person used/i);
    }
  });
});

describe("free pelo PREÇO, não pelo nome", () => {

  it("a lista descoberta manda, mesmo sem o sufixo", () => {
    expect(isFree("vendor/modelo")).toBe(false);
    expect(isFree("vendor/modelo", ["vendor/modelo"])).toBe(true);
  });

  it("sem lista, o sufixo ainda é o palpite", () => {
    expect(isFree("x/y:free", [])).toBe(true);
    expect(isFree("x/y:free")).toBe(true);
  });

  it("a assistente escolhe um grátis SEM sufixo", () => {
    const alvo = pickAssistant({
      activeModels: { openrouter: ["pago/um", "grátis/dois"] },
      freeModels: { openrouter: ["grátis/dois"] },
    });
    expect(alvo).toEqual({ provider: "openrouter", model: "grátis/dois" });
  });

  it("escaneou mas não curou nada: ainda assim acha um", () => {

    expect(
      pickAssistant({ freeModels: { openrouter: ["a/b"] } })
    ).toEqual({ provider: "openrouter", model: "a/b" });
  });
});

describe("ehPrecoZero", () => {
  it("zero dos dois lados é grátis", () => {
    expect(isZeroPrice({ prompt: "0", completion: "0" })).toBe(true);
    expect(isZeroPrice({ prompt: 0, completion: 0 })).toBe(true);
  });

  it("grátis na entrada e pago na saída NÃO é grátis", () => {
    expect(isZeroPrice({ prompt: "0", completion: "0.0000004" })).toBe(false);
  });

  it("sem preço, não assume nada", () => {
    expect(isZeroPrice(undefined)).toBe(false);
    expect(isZeroPrice({})).toBe(false);
    expect(isZeroPrice({ prompt: "grátis", completion: "grátis" })).toBe(false);
  });
});

describe("o interrogatório pede TRÊS", () => {
  it("o prompt manda exatamente três, e proíbe uma quarta", () => {

    const p = promptSkill("guided", ICONES, CORES);
    expect(p).toMatch(/EXACTLY 3 options/);
    expect(p).toMatch(/never offer one yourself/i);
  });
});

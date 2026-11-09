import { describe, it, expect } from "vitest";
import {
  ehFree,
  escolherAssistente,
  motivoIndisponivel,
} from "../src/assistant/model";
import { ehPrecoZero } from "../src/providers/openrouter";
import {
  lerObjeto,
  lerProjeto,
  lerSkill,
  lerPergunta,
  lerTexto,
  recortarJson,
} from "../src/assistant/parse";
import {
  appLanguage,
  promptDescricao,
  promptInstrucoes,
  promptProjeto,
  promptSkill,
} from "../src/assistant/prompt";

const ICONES = ["folder", "graduation-cap", "plane"];
const CORES = ["default", "#e5484d", "#4361ee"];

describe("escolherAssistente", () => {
  it("a escolha explícita manda", () => {
    expect(
      escolherAssistente({
        assistantProvider: "openai",
        assistantModel: "gpt-5",
        favoriteModels: { openrouter: ["x/y:free"] },
      })
    ).toEqual({ provider: "openai", model: "gpt-5" });
  });

  it("sem escolha, pega o FAVORITO free do OpenRouter", () => {

    expect(
      escolherAssistente({
        favoriteModels: { openrouter: ["pago/modelo", "meta/llama:free"] },
        activeModels: { openrouter: ["outro/coisa:free"] },
      })
    ).toEqual({ provider: "openrouter", model: "meta/llama:free" });
  });

  it("sem favorito free, cai pros modelos conhecidos", () => {
    expect(
      escolherAssistente({
        favoriteModels: { openrouter: ["pago/modelo"] },
        activeModels: { openrouter: ["pago/outro", "x/y:free"] },
      })
    ).toEqual({ provider: "openrouter", model: "x/y:free" });
  });

  it("sem nada servível, devolve null — que é convite, não erro", () => {
    expect(escolherAssistente({})).toBeNull();
    expect(
      escolherAssistente({ activeModels: { openrouter: ["só/pago"] } })
    ).toBeNull();
  });

  it("free é o sufixo, como no resto do app", () => {
    expect(ehFree("meta/llama:free")).toBe(true);
    expect(ehFree("meta/llama")).toBe(false);
  });
});

describe("motivoIndisponivel", () => {
  it("sem modelo e sem chave dizem coisas DIFERENTES", () => {

    const semModelo = motivoIndisponivel(null, () => true);
    const semChave = motivoIndisponivel(
      { provider: "openrouter", model: "x:free" },
      () => false
    );
    expect(semModelo).toMatch(/model/i);
    expect(semChave).toMatch(/key/i);
    expect(semModelo).not.toBe(semChave);
  });

  it("com modelo e chave, não há motivo", () => {
    expect(
      motivoIndisponivel({ provider: "openrouter", model: "x:free" }, () => true)
    ).toBeNull();
  });
});

describe("recortarJson", () => {
  it("tira a cerca de código", () => {
    expect(recortarJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("acha o objeto no meio da prosa", () => {

    expect(recortarJson('Sure! {"a":1} Hope that helps.')).toBe('{"a":1}');
  });

  it("sem objeto nenhum, devolve null em vez de lançar", () => {
    expect(recortarJson("desculpa, não entendi")).toBeNull();
    expect(lerObjeto("desculpa")).toBeNull();
  });

  it("JSON quebrado não derruba nada", () => {
    expect(lerObjeto('{"a": }')).toBeNull();
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
    expect(lerSkill(ok, ICONES, "folder", CORES)).toEqual(ok);
  });

  it("skill também tem cor, e fora da paleta vira default", () => {

    expect(lerSkill({ ...ok, color: "roxo" }, ICONES, "folder", CORES)?.color).toBe(
      "default"
    );

    expect(lerSkill(ok, ICONES, "folder")?.color).toBe("default");
  });

  it("ícone inventado vira o padrão, e não um buraco na tela", () => {
    const r = lerSkill({ ...ok, icon: "sparkles-2" }, ICONES, "folder", CORES);
    expect(r?.icon).toBe("folder");
  });

  it("modo inventado vira vazio (abre onde a pessoa estiver)", () => {
    expect(lerSkill({ ...ok, mode: "wizard" }, ICONES, "folder", CORES)?.mode).toBe("");
    expect(lerSkill({ ...ok, mode: "agent" }, ICONES, "folder", CORES)?.mode).toBe(
      "agent"
    );
  });

  it("sem corpo não é skill", () => {

    expect(lerSkill({ ...ok, body: "" }, ICONES, "folder", CORES)).toBeNull();
    expect(lerSkill({ ...ok, body: 42 }, ICONES, "folder", CORES)).toBeNull();
  });

  it("corpo cercado de crase entra limpo", () => {
    const r = lerSkill({ ...ok, body: "```\nfaz isso\n```" }, ICONES, "folder", CORES);
    expect(r?.body).toBe("faz isso");
  });

  it("nome quilométrico não estoura o campo", () => {
    const r = lerSkill({ ...ok, name: "a".repeat(300) }, ICONES, "folder", CORES);
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
    expect(lerProjeto(ok, ICONES, CORES, vault)).toEqual(ok);
  });

  it("nota inventada é DESCARTADA", () => {

    const r = lerProjeto(
      { ...ok, notes: ["Refs/Kuhn.md", "Projects/Tese.md"] },
      ICONES,
      CORES,
      vault
    );
    expect(r?.notes).toEqual(["Refs/Kuhn.md"]);
  });

  it("nota repetida entra uma vez só", () => {
    const r = lerProjeto(
      { ...ok, notes: ["Ideias.md", "Ideias.md"] },
      ICONES,
      CORES,
      vault
    );
    expect(r?.notes).toEqual(["Ideias.md"]);
  });

  it("cor fora da paleta vira o padrão", () => {
    expect(lerProjeto({ ...ok, color: "red" }, ICONES, CORES, vault)?.color).toBe(
      "default"
    );
  });

  it("sem nome não é projeto", () => {
    expect(lerProjeto({ ...ok, name: "  " }, ICONES, CORES, vault)).toBeNull();
  });

  it("`notes` que não é lista não quebra", () => {
    expect(
      lerProjeto({ ...ok, notes: "Refs/Kuhn.md" }, ICONES, CORES, vault)?.notes
    ).toEqual([]);
  });

  it("instrução vazia é válida — nem todo projeto tem o que dizer", () => {
    const r = lerProjeto({ ...ok, instructions: "" }, ICONES, CORES, vault);
    expect(r?.instructions).toBe("");
  });
});

describe("lerPergunta", () => {
  it("devolve a pergunta do modo guiado", () => {
    expect(lerPergunta({ ask: "Pra que você usa isso?" })).toBe(
      "Pra que você usa isso?"
    );
  });

  it("sem pergunta, string vazia", () => {
    expect(lerPergunta({ draft: {} })).toBe("");
    expect(lerPergunta(null)).toBe("");
  });
});

describe("os prompts", () => {
  it("o de skill leva os ícones permitidos", () => {
    const p = promptSkill("direto", ICONES, CORES, "English");
    expect(p).toContain("graduation-cap");
    expect(p).toContain("Do not ask questions");
  });

  it("o guiado permite perguntar, com teto", () => {
    expect(promptSkill("guiado", ICONES, CORES, "English")).toMatch(/up to 3/i);
  });

  it("sem notas, ele MANDA devolver lista vazia", () => {

    const p = promptProjeto("direto", ICONES, CORES, [], "English");
    expect(p).toContain('"notes": []');
    expect(p).not.toContain("Notes in this vault");
  });

  it("com notas, elas vão exatas", () => {
    const p = promptProjeto("direto", ICONES, CORES, ["A/b.md"], "English");
    expect(p).toContain("- A/b.md");
  });
});

describe("um campo só", () => {
  it("a descrição leva o prompt como matéria-prima", () => {

    const p = promptDescricao({ name: "Weekly review", body: "Go through…", idioma: "English" });
    expect(p).toContain("Weekly review");
    expect(p).toContain("Go through…");
    expect(p).toContain('{"text": "..."}');
  });

  it("as instruções levam o projeto e as notas anexadas", () => {
    const p = promptInstrucoes({
      name: "Tese",
      notes: ["Refs/Kuhn.md"],
      atual: "",
      idioma: "Brazilian Portuguese",
    });
    expect(p).toContain("Project: Tese");
    expect(p).toContain("- Refs/Kuhn.md");

    expect(p).toMatch(/ADD to how the app already works/);
  });

  it("o que já está escrito vai junto pra ser MELHORADO", () => {

    const p = promptInstrucoes({
      name: "Tese",
      notes: [],
      atual: "Sempre citar a fonte.",
      idioma: "Brazilian Portuguese",
    });
    expect(p).toContain("Sempre citar a fonte.");
    expect(p).toMatch(/improve on it/i);
  });

  it("campo vazio não manda uma seção vazia", () => {
    const p = promptInstrucoes({ name: "Tese", notes: [], atual: "   ", idioma: "English" });
    expect(p).not.toMatch(/improve on it/i);
    expect(p).not.toContain("Notes already attached");
  });

  it("lerTexto respeita o teto e limpa a cerca", () => {
    expect(lerTexto({ text: "```\noi\n```" }, 140)).toBe("oi");
    expect(lerTexto({ text: "a".repeat(500) }, 140).length).toBe(140);
    expect(lerTexto({ text: 42 }, 140)).toBe("");
    expect(lerTexto(null, 140)).toBe("");
  });
});

describe("the language", () => {
  it("resolves locale to English", () => {
    expect(appLanguage("en-us")).toBe("English");
    expect(appLanguage("auto")).toBe("English");
    expect(appLanguage("nb-no")).toBe("English");
  });

  it("all prompts instruct writing in the app language", () => {
    const todos = [
      promptSkill("direto", ICONES, CORES, "English"),
      promptProjeto("direto", ICONES, CORES, [], "English"),
      promptDescricao({ name: "x", body: "y", idioma: "English" }),
      promptInstrucoes({
        name: "x",
        notes: [],
        atual: "",
        idioma: "English",
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
    expect(ehFree("vendor/modelo")).toBe(false);
    expect(ehFree("vendor/modelo", ["vendor/modelo"])).toBe(true);
  });

  it("sem lista, o sufixo ainda é o palpite", () => {
    expect(ehFree("x/y:free", [])).toBe(true);
    expect(ehFree("x/y:free")).toBe(true);
  });

  it("a assistente escolhe um grátis SEM sufixo", () => {
    const alvo = escolherAssistente({
      activeModels: { openrouter: ["pago/um", "grátis/dois"] },
      freeModels: { openrouter: ["grátis/dois"] },
    });
    expect(alvo).toEqual({ provider: "openrouter", model: "grátis/dois" });
  });

  it("escaneou mas não curou nada: ainda assim acha um", () => {

    expect(
      escolherAssistente({ freeModels: { openrouter: ["a/b"] } })
    ).toEqual({ provider: "openrouter", model: "a/b" });
  });
});

describe("ehPrecoZero", () => {
  it("zero dos dois lados é grátis", () => {
    expect(ehPrecoZero({ prompt: "0", completion: "0" })).toBe(true);
    expect(ehPrecoZero({ prompt: 0, completion: 0 })).toBe(true);
  });

  it("grátis na entrada e pago na saída NÃO é grátis", () => {
    expect(ehPrecoZero({ prompt: "0", completion: "0.0000004" })).toBe(false);
  });

  it("sem preço, não assume nada", () => {
    expect(ehPrecoZero(undefined)).toBe(false);
    expect(ehPrecoZero({})).toBe(false);
    expect(ehPrecoZero({ prompt: "grátis", completion: "grátis" })).toBe(false);
  });
});

describe("o interrogatório pede TRÊS", () => {
  it("o prompt manda exatamente três, e proíbe uma quarta", () => {

    const p = promptSkill("guiado", ICONES, CORES, "English");
    expect(p).toMatch(/EXACTLY 3 options/);
    expect(p).toMatch(/never offer one yourself/i);
  });
});

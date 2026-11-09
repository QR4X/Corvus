// src/assistant/prompt.ts
// O que a assistente SABE.
//
// Ela não é um chat com um pedido colado na frente. O que a torna útil é saber
// duas coisas que ninguém de fora sabe: como um skill e um projeto funcionam
// NESTE app (o corpo do skill vira texto no campo, as instruções do projeto
// SOMAM ao prompt em vez de substituí-lo), e como um vault do Obsidian é
// escrito (wikilink, frontmatter, nota diária, tag). Sem a primeira, ela
// escreve conselho genérico de prompt; sem a segunda, escreve como se o vault
// fosse uma pasta de arquivos de texto.
//
// O contrato de saída é JSON, e é apertado de propósito: os campos são de um
// formulário, não de uma conversa, e tudo que sai daqui passa pelo parse (que
// não confia em nada — ver parse.ts).

/**
 * O idioma em que ela escreve — o do APP, não o que ela adivinhar.
 *
 * "Write in the same language the person used" parecia gentil e era uma porta
 * aberta: numa frase curta, ambígua ou com um nome próprio no meio, o modelo
 * decide sozinho — e decidiu norueguês num app que só fala dois idiomas. O
 * texto que sai daqui vai morar no formulário e depois na lista, ao lado de
 * tudo que o app escreve. Ou é um dos dois, ou está errado.
 */
export function idiomaDoApp(locale: string): string {
  return locale === "pt-br" ? "Brazilian Portuguese" : "English";
}

/** Regras que valem pras duas — quem ela é, e como responde. */
function base(idioma: string): string {
  return `You help someone set up their Corvus workspace inside Obsidian.
You know Obsidian well: wikilinks ([[Note]]), frontmatter, daily notes, tags,
folders, and that a vault is someone's own writing — not a database.

Rules for every answer:
- Answer with ONE JSON object and nothing else. No prose, no code fences.
- Write EVERY field in ${idioma}. This is not negotiable: the app only speaks
  ${idioma} here, and your text sits next to text the app wrote. Even if the
  person writes to you in another language, answer in ${idioma}.
- Be concrete. Never invent a file, folder or note that was not given to you.`;
}

/** O que um skill É aqui — a parte que não dá pra inferir de fora. */
const SOBRE_SKILL = `A SKILL in Corvus is a saved prompt. Tapping it drops its
text into the composer, ready to send — it is not an agent, not a macro, not a
setting. So the body must read as something a person would type, in the first
person, addressed to the assistant.

Fields:
- "name": 2-4 words, what it DOES, not what it is. "Weekly review", not
  "Review assistant".
- "description": one line shown under the name in the list. Optional.
- "icon": one of the allowed names given below. Nothing else.
- "color": one of the allowed values given below, matching what the skill is
  for. "default" when nothing in particular fits.
- "mode": "" (opens wherever the person is), "chat" (plain conversation),
  "vault-qa" (answers from the vault's notes), or "agent" (can write to the
  vault). Choose "vault-qa" only if answering NEEDS the person's notes; choose
  "agent" only if the task must CHANGE files.
- "body": the prompt itself. Several lines is fine. Ask for the shape of the
  answer when the shape matters (a list, a table, three bullets).`;

/** O que um projeto É aqui. */
const SOBRE_PROJETO = `A PROJECT in Corvus groups chats around one subject, and
carries two things into every new chat started inside it: its source notes and
its custom instructions.

The instructions ADD to how the app already works — they never replace it. So
do not write "you are a helpful assistant" or restate general behaviour. Write
only what is true about THIS subject: vocabulary, constraints, what the person
is trying to get done, how they want to be answered.

Fields:
- "name": 1-3 words, the subject as the person would say it.
- "icon" and "color": from the allowed lists below, matching the subject.
- "instructions": what the model should know in every chat here. A few lines.
  Empty string if nothing is genuinely worth saying.
- "notes": paths to attach as sources, copied EXACTLY from the vault list
  given below. Only notes that clearly belong to this subject — three right
  ones beat ten plausible ones. Empty array if none fit or no list was given.`;

/** Uma volta só: nada de perguntar, devolve o rascunho. */
const DIRETO = `Return: {"draft": { ...the fields... }}
Do not ask questions. Fill everything from what you were told; where you are
unsure, make the most useful reasonable choice.`;

/** Guiado: pergunta uma coisa de cada vez, e fecha. */
const GUIADO = `You may ask up to 3 short questions before writing, one at a
time, and only when the answer would genuinely change what you write.

To ask: {"ask": "your question", "options": ["...", "...", "..."]}
ALWAYS give EXACTLY 3 options, never more, never fewer. They are how the person
answers on a phone: a tap instead of typing. Each one is at most 3 words, and
they must be three real, different answers to YOUR question — not
"yes/no/maybe", not a scale, not "other". The app adds a fourth option of its
own for typing, so never offer one yourself and never say "or type your own"
in the question.

When you have enough (or after 3 questions): {"draft": { ...the fields... }}

Ask about the person's purpose and habits, never about the fields themselves —
they will review and edit everything afterwards.`;

export type ModoAssistente = "direto" | "guiado";

function listas(rotulo: string, itens: readonly string[]): string {
  return `Allowed ${rotulo}: ${itens.join(", ")}.`;
}

export function promptSkill(
  modo: ModoAssistente,
  icones: readonly string[],
  cores: readonly string[],
  idioma: string
): string {
  return [
    base(idioma),
    SOBRE_SKILL,
    listas("icon names", icones),
    listas("color values", cores),
    modo === "direto" ? DIRETO : GUIADO,
  ].join("\n\n");
}

export function promptProjeto(
  modo: ModoAssistente,
  icones: readonly string[],
  cores: readonly string[],
  /** Caminhos do vault que a pessoa autorizou a enviar. Vazio = não enviar. */
  notas: readonly string[],
  idioma: string
): string {
  const partes = [
    base(idioma),
    SOBRE_PROJETO,
    listas("icon names", icones),
    listas("color values", cores),
  ];
  // A lista do vault só entra quando existe. Dizer "here are the notes:" e não
  // mandar nada convida o modelo a preencher o vazio com caminhos plausíveis.
  if (notas.length)
    partes.push(
      `Notes in this vault (use these exact paths, or none):\n${notas
        .map((n) => `- ${n}`)
        .join("\n")}`
    );
  else
    partes.push(
      `You have NOT been given the vault's notes. Return "notes": [].`
    );
  partes.push(modo === "direto" ? DIRETO : GUIADO);
  return partes.join("\n\n");
}

/**
 * Quantas notas cabem no prompt.
 *
 * Teto porque um vault de dez mil notas viraria um prompt de centenas de
 * milhares de tokens — no modelo free isso é um erro de contexto, não uma
 * resposta ruim. E porque é o nome das SUAS notas indo pra fora: quanto menos
 * sair, melhor, e a sugestão fica boa com as mais recentes.
 */
export const TETO_NOTAS = 300;

// ── Um campo só ────────────────────────────────────────────────────────────
// A diferença destes pros de cima é de onde vem a matéria-prima. Lá, a pessoa
// descreve o que quer e a assistente inventa a partir disso. Aqui o formulário
// JÁ tem o assunto — o prompt do skill, o nome e as notas do projeto —, e o que
// falta é uma frase que se escreve OLHANDO pra isso. Por isso estes funcionam
// com o campo de entrada vazio: o contexto É a entrada.

const UM_CAMPO = `Return: {"text": "..."} with the field's content and nothing
else. You may return {"ask": "..."} instead if one thing genuinely needs
clarifying first — but only if the answer would really change what you write.`;

/** A descrição de um skill: a linha que aparece na lista, sob o nome. */
export function promptDescricao(ctx: {
  name: string;
  body: string;
  idioma: string;
}): string {
  return [
    base(ctx.idioma),
    `Write the one-line DESCRIPTION of a skill — the line shown under its name
in the list. It says what the skill gives you, in the fewest words that still
mean something. Under 80 characters. Do not repeat the name. Do not start with
"This skill".`,
    `Skill name: ${ctx.name || "(not named yet)"}`,
    `Its prompt:\n${ctx.body || "(empty)"}`,
    UM_CAMPO,
  ].join("\n\n");
}

/** As instruções de um projeto — o que vai junto em toda conversa dali. */
export function promptInstrucoes(ctx: {
  name: string;
  notes: readonly string[];
  atual: string;
  idioma: string;
}): string {
  const partes = [
    base(ctx.idioma),
    `Write the CUSTOM INSTRUCTIONS of a project: what the model should know in
every chat started inside it.

They ADD to how the app already works — they never replace it. So do not write
"you are a helpful assistant", do not restate general behaviour, and do not
explain what Obsidian is. Write only what is true about THIS subject: its
vocabulary, its constraints, what the person is trying to get done, how they
want to be answered. A few plain sentences, not a bulleted spec.`,
    `Project: ${ctx.name || "(not named yet)"}`,
  ];
  if (ctx.notes.length)
    partes.push(
      `Notes already attached as its sources:\n${ctx.notes
        .map((n) => `- ${n}`)
        .join("\n")}`
    );
  // O que já está escrito vai junto: pedir ajuda num campo COM texto quase
  // sempre quer dizer "melhora isto", não "joga fora e começa de novo".
  if (ctx.atual.trim())
    partes.push(
      `What is written there now — improve on it, keep what is worth keeping:\n${ctx.atual}`
    );
  partes.push(UM_CAMPO);
  return partes.join("\n\n");
}

/**
 * Procurar NOTAS pra um projeto — o que ele deve saber.
 *
 * É o único pedido desta assistente em que a matéria-prima não é texto que a
 * pessoa escreveu: é a lista de nomes do vault. Por isso ele só existe com a
 * chave `assistantSeesVault` ligada, e mesmo assim só vão CAMINHOS, nunca o
 * conteúdo de uma nota — quem monta a lista é useAssistant, com o teto de
 * TETO_NOTAS e as mais recentes primeiro.
 *
 * As já escolhidas vão junto pra ela não devolver o que já está na lista: uma
 * sugestão repetida parece que o botão não fez nada.
 */
export function promptNotas(ctx: {
  name: string;
  instructions: string;
  escolhidas: readonly string[];
  caminhos: readonly string[];
  idioma: string;
}): string {
  const partes = [
    base(ctx.idioma),
    SOBRE_PROJETO,
    `Pick the notes from this vault that this project should KNOW — they are
attached as its sources and go in as context on every chat started inside it.
Choose by what the path says: folder, title, date. Prefer fewer, clearly
relevant notes over many loosely related ones. If nothing fits, return none.`,
    `Project: ${ctx.name || "(not named yet)"}`,
  ];
  if (ctx.instructions.trim())
    partes.push(`Its instructions:\n${ctx.instructions.trim()}`);
  if (ctx.escolhidas.length)
    partes.push(
      `Already attached — do NOT return these again:\n${ctx.escolhidas
        .map((n) => `- ${n}`)
        .join("\n")}`
    );
  partes.push(
    `Notes in this vault (use these exact paths, or none):\n${ctx.caminhos
      .map((n) => `- ${n}`)
      .join("\n")}`
  );
  partes.push(
    `Return: {"notes": ["exact/path.md", ...]} — at most 10 paths, copied
exactly from the list above, and nothing else.`
  );
  return partes.join("\n\n");
}

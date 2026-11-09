const FRASES: Record<string, string> = {
  en: "Hi, I'm {nome}. This is how I'll read your answers out loud.",
  pt: "Oi! Eu sou {nome}, e é assim que eu vou ler as suas respostas.",
  es: "¡Hola! Soy {nome}, y así es como voy a leer tus respuestas.",
  fr: "Bonjour ! Je suis {nome}, et c'est ainsi que je lirai vos réponses.",
  de: "Hallo! Ich bin {nome}, und so lese ich dir deine Antworten vor.",
  it: "Ciao! Sono {nome}, ed è così che leggerò le tue risposte.",
  ja: "こんにちは、{nome}です。このように回答を読み上げます。",
};

export function idiomaDaAmostra(falado: string | undefined, doApp: string | undefined): string {
  for (const codigo of [falado, doApp]) {
    const base = (codigo ?? "").trim().toLowerCase().split(/[-_]/)[0];
    if (base && Object.prototype.hasOwnProperty.call(FRASES, base)) return base;
  }
  return "en";
}

export function fraseDaAmostra(nome: string, idioma: string): string {
  const frase = Object.prototype.hasOwnProperty.call(FRASES, idioma) ? FRASES[idioma] : FRASES.en;
  return frase.replace("{nome}", nome);
}

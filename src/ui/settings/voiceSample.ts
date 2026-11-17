const PHRASES: Record<string, string> = {
  en: "Hi, I'm {name}. This is how I'll read your answers out loud.",
  pt: "Oi! Eu sou {name}, e é assim que eu vou ler as suas respostas.",
  es: "¡Hola! Soy {name}, y así es como voy a leer tus respuestas.",
  fr: "Bonjour ! Je suis {name}, et c'est ainsi que je lirai vos réponses.",
  de: "Hallo! Ich bin {name}, und so lese ich dir deine Antworten vor.",
  it: "Ciao! Sono {name}, ed è così che leggerò le tue risposte.",
  ja: "こんにちは、{name}です。このように回答を読み上げます。",
};

export function pickSampleLanguage(spoken: string | undefined, appLanguage: string | undefined): string {
  for (const code of [spoken, appLanguage]) {
    const base = (code ?? "").trim().toLowerCase().split(/[-_]/)[0];
    if (base && Object.prototype.hasOwnProperty.call(PHRASES, base)) return base;
  }
  return "en";
}

export function samplePhrase(name: string, language: string): string {
  const phrase = Object.prototype.hasOwnProperty.call(PHRASES, language) ? PHRASES[language] : PHRASES.en;
  return phrase.replace("{name}", name);
}

import { describe, it, expect } from "vitest";
import { extensionFor } from "../src/ui/useVoice";

describe("extensionFor", () => {
  it("acompanha o contêiner que o aparelho escolheu", () => {

    expect(extensionFor("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionFor("audio/mp4")).toBe("mp4");
    expect(extensionFor("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extensionFor("audio/wav")).toBe("wav");
  });

  it("desconhecido cai em webm, que é o que o Chromium grava", () => {
    expect(extensionFor("")).toBe("webm");
    expect(extensionFor("audio/x-qualquer-coisa")).toBe("webm");
  });
});

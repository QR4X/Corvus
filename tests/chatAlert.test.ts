import { describe, it, expect } from "vitest";
import { ALERT_LABEL, alertCount, chatAlert } from "../src/ui/chatAlert";

describe("chatAlert", () => {
  const nada = { esperando: false, rodando: false, naoLida: false };

  it("conversa quieta não mostra nada", () => {
    expect(chatAlert(nada)).toBeNull();
  });

  it("cada estado sozinho", () => {
    expect(chatAlert({ ...nada, running: true })).toBe("running");
    expect(chatAlert({ ...nada, unread: true })).toBe("unread");
    expect(chatAlert({ ...nada, waiting: true })).toBe("waiting");
  });

  it("quem está esperando VOCÊ fala mais alto", () => {

    expect(chatAlert({ waiting: true, running: true, unread: true })).toBe(
      "waiting"
    );
    expect(chatAlert({ waiting: true, running: true, unread: false })).toBe(
      "waiting"
    );
  });

  it("respondendo ganha de não lida", () => {

    expect(chatAlert({ waiting: false, running: true, unread: true })).toBe(
      "running"
    );
  });

  it("todo estado tem uma frase", () => {
    for (const k of ["waiting", "running", "unread"] as const) {
      expect(ALERT_LABEL[k].length).toBeGreaterThan(0);
    }
  });
});

describe("alertCount", () => {
  const chats = [
    { id: "a", mode: "agent" },
    { id: "b", mode: "agent" },
    { id: "c", mode: "chat" },
    { id: "d", mode: "agent" },
  ];

  it("conta as não lidas daquele módulo, e só daquele", () => {
    const n = alertCount(chats, "agent", {
      waitingId: null,
      unread: new Set(["a", "d", "c"]),
    });
    expect(n).toBe(2);
    expect(
      alertCount(chats, "chat", { waitingId: null, unread: new Set(["c"]) })
    ).toBe(1);
  });

  it("a que espera aprovação também conta", () => {
    expect(
      alertCount(chats, "agent", { waitingId: "b", unread: new Set() })
    ).toBe(1);
  });

  it("não conta duas vezes a mesma conversa", () => {
    expect(
      alertCount(chats, "agent", { waitingId: "a", unread: new Set(["a"]) })
    ).toBe(1);
  });

  it("quem está só RESPONDENDO não entra na conta", () => {

    expect(
      alertCount(chats, "agent", { waitingId: null, unread: new Set() })
    ).toBe(0);
  });

  it("módulo sem nada devolve zero, não undefined", () => {
    expect(
      alertCount([], "agent", { waitingId: null, unread: new Set(["a"]) })
    ).toBe(0);
  });
});

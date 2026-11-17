import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../src/store/chat";
import { storeMessagesToProvider } from "../src/agent/conversation";
import { toOpenAIMessages } from "../src/providers/_shared";
import type { ImageAttachment, NoteAttachment } from "../src/providers/base";

const st = () => useChatStore.getState();

const NOTE: NoteAttachment = {
  type: "note",
  path: "PROJECTS/FRAMEWORKS.md",
  content: "# Frameworks\n\nnote content",
};
const IMAGE: ImageAttachment = {
  type: "image",
  dataUrl: "data:image/png;base64,AAAA",
  mimeType: "image/png",
  name: "print.png",
};

describe("pending attachments in the store", () => {
  beforeEach(() => {
    useChatStore.setState({ attachments: [], messages: [] });
  });

  it("accumulate in the order they were picked", () => {
    st().addAttachment(NOTE);
    st().addAttachment(IMAGE);
    expect(st().attachments.map((a) => a.type)).toEqual(["note", "image"]);
  });

  it("removing one leaves the others", () => {
    st().addAttachment(NOTE);
    st().addAttachment(IMAGE);
    st().removeAttachment(0);
    expect(st().attachments).toEqual([IMAGE]);
  });

  it("a new chat does not inherit attachments from the previous one", () => {
    st().addAttachment(IMAGE);
    st().newChat();
    expect(st().attachments).toEqual([]);
  });
});

describe("from the store to the payload", () => {
  it("an image becomes an image_url content part on the last user message", () => {
    const msgs = [
      { type: "user" as const, content: "old" },
      { type: "ai-response" as const, content: "answer" },
      { type: "user" as const, content: "look at this screenshot" },
    ];
    const provider = storeMessagesToProvider(msgs, [IMAGE]);
    const payload = toOpenAIMessages(provider) as Array<{
      role: string;
      content: unknown;
    }>;
    const last = payload[payload.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toEqual([
      { type: "text", text: "look at this screenshot" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);

    expect(payload[0].content).toBe("old");
  });

  it("a note is not a content part; it travels as text context", () => {
    const provider = storeMessagesToProvider(
      [{ type: "user" as const, content: "summarize" }],
      [NOTE]
    );

    expect(provider[0].attachments).toEqual([NOTE]);

    const payload = toOpenAIMessages(provider) as Array<{ content: unknown }>;
    expect(payload[0].content).toBe("summarize");
  });

  it("with an image and a note, only the image becomes a content part", () => {
    const provider = storeMessagesToProvider(
      [{ type: "user" as const, content: "compare" }],
      [NOTE, IMAGE]
    );
    const payload = toOpenAIMessages(provider) as Array<{ content: unknown }>;
    expect(payload[0].content).toEqual([
      { type: "text", text: "compare" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });
});

import type { ChatSummary } from "./chatPersistence";

const SEP = "\x1f";

export function chatIndexSignature(arr: readonly ChatSummary[]): string {
  return (
    arr.length +
    ":" +
    arr
      .map((c) =>
        [
          c.id,
          c.date,
          c.title,
          c.messageCount,
          c.tokensIn,
          c.tokensOut,
          c.model,
          c.toolCount,
          c.starred,
          c.preview,
        ].join(SEP)
      )
      .join("|")
  );
}

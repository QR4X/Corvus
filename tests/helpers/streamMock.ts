const enc = new TextEncoder();

export function bytesStream(chunks: string[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

export function fakeStreamResponse(
  chunks: string[],
  init: { status?: number; ok?: boolean } = {}
): Response {
  return {
    status: init.status ?? 200,
    ok: init.ok ?? true,
    body: bytesStream(chunks),
    json: async () => ({}),
  } as unknown as Response;
}

export function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

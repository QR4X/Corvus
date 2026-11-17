export type EditorRequest =

  | { kind: "note"; path: string; send?: string }

  | { kind: "selection"; path: string; text: string };

type RequestListener = (p: EditorRequest) => void;

let listener: RequestListener | null = null;
const queue: EditorRequest[] = [];

export function sendToPanel(p: EditorRequest): void {
  if (listener) listener(p);
  else queue.push(p);
}

export function listenForRequests(fn: RequestListener): () => void {
  listener = fn;
  while (queue.length > 0) fn(queue.shift() as EditorRequest);
  return () => {
    if (listener === fn) listener = null;
  };
}

export function clearRequests(): void {
  listener = null;
  queue.length = 0;
}

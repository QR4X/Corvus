import { render } from "preact/compat";

export function createRoot(container: Element | DocumentFragment) {
  return {
    render(children: unknown) {
      render(children as never, container);
    },
    unmount() {
      render(null as never, container);
    },
  };
}

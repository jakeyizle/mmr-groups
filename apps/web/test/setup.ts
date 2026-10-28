import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// findBy* waits this long; the default 1 s is too tight under a full parallel run.
configure({ asyncUtilTimeout: 5000 });

// Forms are handled in the app; a submit left to the browser reloads the page.
let unprevented = 0;
window.addEventListener("submit", (e) => {
  if (!e.defaultPrevented) unprevented++;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  const n = unprevented;
  unprevented = 0;
  if (n > 0) throw new Error(`${String(n)} form submit(s) not prevented`);
});

// jsdom has no layout; Recharts' ResponsiveContainer and Radix need it.
globalThis.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// Radix Select uses pointer capture and scrolling, which jsdom lacks.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = vi.fn();
Element.prototype.scrollIntoView = vi.fn();

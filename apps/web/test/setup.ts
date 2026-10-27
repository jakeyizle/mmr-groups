import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

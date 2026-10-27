/** Categorical series colors (validated palette in index.css), in fixed order, never cycled. */
export const SERIES = Array.from(
  { length: 8 },
  (_, i) => `var(--series-${String(i + 1)})`,
);

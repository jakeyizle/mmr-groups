/** Code-unit order (IDs, ISO dates), unlike `localeCompare`. */
export const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

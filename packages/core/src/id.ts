import { monotonicFactory } from "ulid";

/** Monotonic ULID: IDs created later (even within one ms) sort after earlier ones. */
export const newId = monotonicFactory();

// Stryker disable next-line EqualityOperator: n = 1 gives 1 either way
export const clampPage = (n: number) => (n < 1 ? 1 : n);

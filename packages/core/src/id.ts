import { monotonicFactory } from "ulid";

/** Monotonic ULID: IDs created later (even within one ms) sort after earlier ones. */
export const newId = monotonicFactory();

export const clampPage = (n: number) => (n < 1 ? 1 : n);

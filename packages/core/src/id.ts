import { monotonicFactory } from "ulid";

/** Monotonic ULID: IDs created later (even within one ms) sort after earlier ones. */
export const newId = monotonicFactory();

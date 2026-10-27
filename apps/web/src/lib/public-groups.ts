import { PUBLIC_GROUP_SORTS, type PublicGroupSort } from "@mmr/core";

export type Dir = "asc" | "desc";
export interface BrowseSearch {
  q?: string;
  sort?: PublicGroupSort;
  dir?: Dir;
}

const isSort = (v: unknown): v is PublicGroupSort =>
  PUBLIC_GROUP_SORTS.includes(v as PublicGroupSort);

/**
 * `/groups` search params. Every key is returned, `undefined` when invalid: the router merges
 * this over the raw URL search, so an omitted key would keep a bad value. Defaults stay out of
 * the URL (VIS-010).
 */
export const validateBrowseSearch = (
  search: Record<string, unknown>,
): BrowseSearch => ({
  q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
  sort: isSort(search.sort) ? search.sort : undefined,
  dir: search.dir === "asc" || search.dir === "desc" ? search.dir : undefined,
});

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const DAY_MS = 86_400_000;

/** Coarse relative time: days under a week, then weeks, months, years. */
export function ago(iso: string, now = Date.now()) {
  const days = Math.round((new Date(iso).getTime() - now) / DAY_MS);
  if (days > -7) return relative.format(days, "day");
  if (days > -60) return relative.format(Math.round(days / 7), "week");
  if (days > -730) return relative.format(Math.round(days / 30), "month");
  return relative.format(Math.round(days / 365), "year");
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${String(n)} ${n === 1 ? one : many}`;

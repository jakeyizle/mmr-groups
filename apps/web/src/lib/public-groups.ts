import { PUBLIC_GROUP_SORTS, type PublicGroupSort } from "@mmr/core";

export type Dir = "asc" | "desc";
export interface BrowseSearch {
  q?: string;
  sort?: PublicGroupSort;
  dir?: Dir;
}

const isSort = (v: unknown): v is PublicGroupSort =>
  PUBLIC_GROUP_SORTS.includes(v as PublicGroupSort);

/** `/groups` search params; anything invalid is dropped. Defaults stay out of the URL (VIS-010). */
export const validateBrowseSearch = (
  search: Record<string, unknown>,
): BrowseSearch => ({
  ...(typeof search.q === "string" && search.q.trim() && { q: search.q }),
  ...(isSort(search.sort) && { sort: search.sort }),
  ...((search.dir === "asc" || search.dir === "desc") && { dir: search.dir }),
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

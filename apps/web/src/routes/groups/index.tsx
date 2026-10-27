import {
  defaultSortDir,
  PUBLIC_GROUP_SORTS,
  type PublicGroupSort,
} from "@mmr/core";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { nativeSelect } from "@/components/match/row-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { client, unwrap } from "@/lib/api";

type Dir = "asc" | "desc";
interface BrowseSearch {
  q?: string;
  sort?: PublicGroupSort;
  dir?: Dir;
}

const isSort = (v: unknown): v is PublicGroupSort =>
  PUBLIC_GROUP_SORTS.includes(v as PublicGroupSort);

export const Route = createFileRoute("/groups/")({
  // Defaults stay out of the URL (VIS-010).
  validateSearch: (search: Record<string, unknown>): BrowseSearch => ({
    ...(typeof search.q === "string" && search.q.trim() && { q: search.q }),
    ...(isSort(search.sort) && { sort: search.sort }),
    ...((search.dir === "asc" || search.dir === "desc") && {
      dir: search.dir,
    }),
  }),
  component: Browse,
});

const SORT_LABELS: Record<PublicGroupSort, string> = {
  name: "Name",
  played: "Latest match",
  matches: "Match count",
  players: "Player count",
  created: "Date created",
};

const DIR_LABELS: Record<PublicGroupSort, Record<Dir, string>> = {
  name: { asc: "A to Z", desc: "Z to A" },
  played: { asc: "Oldest first", desc: "Newest first" },
  matches: { asc: "Fewest first", desc: "Most first" },
  players: { asc: "Fewest first", desc: "Most first" },
  created: { asc: "Oldest first", desc: "Newest first" },
};

const absolute = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const DAY_MS = 86_400_000;

function ago(iso: string) {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / DAY_MS);
  if (days > -7) return relative.format(days, "day");
  if (days > -60) return relative.format(Math.round(days / 7), "week");
  if (days > -730) return relative.format(Math.round(days / 30), "month");
  return relative.format(Math.round(days / 365), "year");
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${String(n)} ${n === 1 ? one : many}`;

/** VIS-009..012: the public group index. */
function Browse() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const sort = search.sort ?? "name";
  const dir = search.dir ?? defaultSortDir(sort);
  const q = search.q ?? "";

  // Debounced into the URL, replacing the history entry.
  const [text, setText] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => {
      if (text.trim() === q.trim()) return;
      void navigate({
        search: (prev) => ({ ...prev, q: text.trim() || undefined }),
        replace: true,
      });
    }, 300);
    return () => {
      clearTimeout(id);
    };
  }, [text, q, navigate]);

  const list = useInfiniteQuery({
    queryKey: ["public-groups", q, sort, dir],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await client["public-groups"].$get({
          query: {
            ...(q && { q }),
            sort,
            dir,
            ...(pageParam && { cursor: pageParam }),
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
  const groups = list.data?.pages.flatMap((p) => p.groups) ?? [];

  return (
    <section className="space-y-4">
      <h1 className="font-heading text-2xl font-semibold">Public groups</h1>
      <Input
        type="search"
        aria-label="Search groups"
        placeholder="Search by name"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <div className="flex gap-2">
        <select
          aria-label="Sort by"
          className={nativeSelect}
          value={sort}
          onChange={(e) => {
            const next = e.target.value as PublicGroupSort;
            void navigate({
              search: (prev) => ({
                ...prev,
                sort: next === "name" ? undefined : next,
                dir: undefined,
              }),
              replace: true,
            });
          }}
        >
          {PUBLIC_GROUP_SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          className="h-9 shrink-0"
          aria-label={`Order: ${DIR_LABELS[sort][dir]}. Reverse`}
          onClick={() => {
            const next: Dir = dir === "asc" ? "desc" : "asc";
            void navigate({
              search: (prev) => ({
                ...prev,
                dir: next === defaultSortDir(sort) ? undefined : next,
              }),
              replace: true,
            });
          }}
        >
          {dir === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
          {DIR_LABELS[sort][dir]}
        </Button>
      </div>

      {list.isSuccess && groups.length === 0 && (
        <p className="text-muted-foreground">
          {q ? `No public groups match “${q}”.` : "No public groups yet."}
        </p>
      )}
      {groups.length > 0 && (
        <ul aria-label="Public groups" className="divide-y rounded-lg border">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                to="/g/$gid"
                params={{ gid: g.id }}
                className="block space-y-0.5 px-4 py-3 hover:bg-muted/50"
              >
                <p className="truncate font-medium">{g.name}</p>
                {g.description && (
                  <p className="truncate text-sm text-muted-foreground">
                    {g.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {plural(g.playerCount, "player")} ·{" "}
                  {plural(g.matchCount, "match", "matches")} ·{" "}
                  <time
                    dateTime={g.lastPlayedAt}
                    title={absolute.format(new Date(g.lastPlayedAt))}
                  >
                    {ago(g.lastPlayedAt)}
                  </time>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <Button
          variant="outline"
          className="w-full"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </section>
  );
}

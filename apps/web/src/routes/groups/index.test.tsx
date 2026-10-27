import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderRoute, stubApi } from "../../../test/render";

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Group ${id}`,
  description: "",
  playerCount: 2,
  matchCount: 1,
  lastPlayedAt: new Date().toISOString(),
  createdAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

interface Page {
  groups: ReturnType<typeof row>[];
  nextCursor: string | null;
}

function setup(
  path: string,
  pages: (q: Record<string, string>) => Page | Promise<Page>,
) {
  const calls = stubApi({
    "GET /api/me": () => ({ user: null }),
    "GET /api/public-groups": () => pages(lastIndexCall().query),
  });
  const lastIndexCall = () => {
    const call = calls.filter((c) => c.path === "/api/public-groups").at(-1);
    if (!call) throw new Error("no index request yet");
    return call;
  };
  const { router, queryClient } = renderRoute(path);
  // Navigations after the first render.
  let navigations = 0;
  router.subscribe("onBeforeNavigate", () => {
    navigations++;
  });
  return {
    router,
    queryClient,
    lastIndexCall,
    navigations: () => navigations,
  };
}

const one = () => ({ groups: [row("1")], nextCursor: null });
const order = () => screen.getByRole("button", { name: /^Order:/ });
const sortBy = () =>
  screen.getByRole<HTMLSelectElement>("combobox", { name: "Sort by" });
const listed = () => screen.findByRole("list", { name: "Public groups" });
const settle = () => new Promise((r) => setTimeout(r, 400));

describe("public group index page", { tags: ["VIS-009"] }, () => {
  it("lists groups with their counts, description and last match", async () => {
    const playedAt = "2026-03-04T15:30:00.000Z";
    setup("/groups", () => ({
      groups: [
        row("1", { description: "Tuesdays", playerCount: 1, matchCount: 1 }),
        row("2", { playerCount: 3, matchCount: 12, lastPlayedAt: playedAt }),
      ],
      nextCursor: null,
    }));
    const items = within(await listed()).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Group 1Tuesdays1 player · 1 match · today",
      expect.stringMatching(
        /^Group 23 players · 12 matches · \d+ months? ago$/,
      ),
    ]);
    const [first, second] = items as [HTMLElement, HTMLElement];
    expect(within(first).getByRole("link")).toHaveProperty("pathname", "/g/1");
    // No empty description line.
    expect(second.querySelectorAll("p")).toHaveLength(2);
    const time = second.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe(playedAt);
    // Date and time, e.g. "Mar 4, 2026, 3:30 PM".
    expect(time?.getAttribute("title")).toMatch(/\w{3} \d+, 2026.*\d:\d\d/);
    expect(screen.queryByText(/No public groups/)).toBeNull();
  });

  it("says when there are no public groups yet, once loaded", async () => {
    let release = (): void => undefined;
    setup(
      "/groups",
      () =>
        new Promise<Page>((resolve) => {
          release = () => {
            resolve({ groups: [], nextCursor: null });
          };
        }),
    );
    await screen.findByRole("heading", { name: "Public groups" });
    await settle();
    expect(screen.queryByText(/No public groups/)).toBeNull();
    release();
    expect(await screen.findByText("No public groups yet.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Public groups" })).toBeNull();
  });
});

const LABELS = {
  name: ["Name", "A to Z", "Z to A"],
  played: ["Latest match", "Newest first", "Oldest first"],
  matches: ["Match count", "Most first", "Fewest first"],
  players: ["Player count", "Most first", "Fewest first"],
  created: ["Date created", "Newest first", "Oldest first"],
} as const;

describe("sorting", { tags: ["VIS-010"] }, () => {
  it("defaults to name A to Z, keeping defaults out of the URL", async () => {
    const { lastIndexCall, router, queryClient } = setup("/groups", one);
    await listed();
    expect(lastIndexCall().query).toEqual({ sort: "name", dir: "asc" });
    // Index visibility changes invalidate this key.
    expect(
      queryClient.getQueryCache().findAll({ queryKey: ["public-groups"] }),
    ).toHaveLength(1);
    expect(sortBy().value).toBe("name");
    expect(order().getAttribute("aria-label")).toBe("Order: A to Z. Reverse");
    expect(order().textContent).toBe("A to Z");
    expect(router.state.location.search).toEqual({});
  });

  it("offers each sort, labelled", async () => {
    setup("/groups", one);
    await listed();
    expect([...sortBy().options].map((o) => [o.value, o.textContent])).toEqual(
      Object.entries(LABELS).map(([k, [label]]) => [k, label]),
    );
  });

  it.each(Object.entries(LABELS))(
    "%s starts at its default direction and reverses",
    async (sort, [, first, reversed]) => {
      const desc = sort !== "name";
      const arrow = (d: boolean) => `.lucide-arrow-${d ? "down" : "up"}`;
      const { lastIndexCall } = setup(`/groups?sort=${sort}`, one);
      await listed();
      expect(lastIndexCall().query).toEqual({
        sort,
        dir: desc ? "desc" : "asc",
      });
      expect(order().textContent).toBe(first);
      expect(order().querySelector(arrow(desc))).not.toBeNull();
      await userEvent.click(order());
      await waitFor(() => {
        expect(order().getAttribute("aria-label")).toBe(
          `Order: ${reversed}. Reverse`,
        );
      });
      expect(order().querySelector(arrow(!desc))).not.toBeNull();
      expect(lastIndexCall().query).toEqual({
        sort,
        dir: desc ? "asc" : "desc",
      });
    },
  );

  it("starts other sorts at their default direction", async () => {
    const { lastIndexCall, router } = setup("/groups", one);
    await listed();
    fireEvent.change(sortBy(), { target: { value: "matches" } });
    await waitFor(() => {
      expect(lastIndexCall().query).toEqual({ sort: "matches", dir: "desc" });
    });
    expect(router.state.location.search).toEqual({ sort: "matches" });
  });

  it("drops dir from the URL once back at the default", async () => {
    const { router } = setup("/groups?sort=players", one);
    await listed();
    await userEvent.click(order());
    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        sort: "players",
        dir: "asc",
      });
    });
    await userEvent.click(order());
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ sort: "players" });
    });
  });

  it("resets the direction when the sort changes, and name leaves the URL", async () => {
    const { router } = setup("/groups?sort=created&dir=asc", one);
    await listed();
    expect(order().textContent).toBe("Oldest first");
    fireEvent.change(sortBy(), { target: { value: "name" } });
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    expect(order().textContent).toBe("A to Z");
  });

  it("replaces the history entry rather than adding one", async () => {
    const { router } = setup("/groups", one);
    await listed();
    fireEvent.change(sortBy(), { target: { value: "created" } });
    await userEvent.click(order());
    await userEvent.type(screen.getByRole("searchbox"), "x");
    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        q: "x",
        sort: "created",
        dir: "asc",
      });
    });
    expect(router.history.length).toBe(1);
  });
});

describe("search", { tags: ["VIS-011"] }, () => {
  it("searches once typing stops, trimmed, and clears when blank", async () => {
    const { lastIndexCall, router, navigations } = setup("/groups", () => ({
      groups: [],
      nextCursor: null,
    }));
    const box = await screen.findByRole("searchbox", { name: "Search groups" });
    await userEvent.type(box, "  chess ");
    await waitFor(() => {
      expect(router.state.location.search).toEqual({ q: "chess" });
    });
    expect(navigations()).toBe(1);
    expect(lastIndexCall().query).toMatchObject({ q: "chess" });
    expect(
      await screen.findByText("No public groups match “chess”."),
    ).toBeTruthy();

    // The same query once trimmed: no navigation.
    await userEvent.type(box, "  ");
    await settle();
    expect(navigations()).toBe(1);

    await userEvent.clear(box);
    await userEvent.type(box, "   ");
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
    expect(lastIndexCall().query).not.toHaveProperty("q");
  });

  it("starts from the URL's query without navigating", async () => {
    const { lastIndexCall, navigations } = setup("/groups?q=%20go", one);
    expect(
      await screen.findByRole("searchbox", { name: "Search groups" }),
    ).toHaveProperty("value", " go");
    await waitFor(() => {
      expect(lastIndexCall().query).toMatchObject({ q: " go" });
    });
    await settle();
    expect(navigations()).toBe(0);
  });
});

describe("paging", { tags: ["VIS-012"] }, () => {
  it("loads the next page with the cursor until there is none", async () => {
    const { lastIndexCall } = setup("/groups", (q) =>
      q.cursor === "c1"
        ? { groups: [row("2")], nextCursor: null }
        : { groups: [row("1")], nextCursor: "c1" },
    );
    await listed();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
    });
    expect(lastIndexCall().query).toEqual({
      sort: "name",
      dir: "asc",
      cursor: "c1",
    });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
});

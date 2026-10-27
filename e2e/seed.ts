import type { Page } from "@playwright/test";

import { signIn } from "./auth";

const headers = { "X-Requested-With": "fetch" };

/**
 * 2×2 group: Ann & Bea vs Cal & Dot six times (Ann's team wins the first 4),
 * then Ann & Cal vs Bea & Dot six times (wins 3, loses 3). Ann ends on a loss.
 */
export async function seeded(page: Page) {
  await signIn(page, "Ann");
  const res = await page.request.post("/api/groups", {
    data: {
      name: "Doubles",
      playerName: "Ann",
      teamFormat: { kind: "fixed", teams: 2, size: 2 },
    },
    headers,
  });
  const { id: gid, playerId: ann } = (await res.json()) as {
    id: string;
    playerId: string;
  };
  const added = await page.request.post(`/api/groups/${gid}/players`, {
    data: { players: [{ name: "Bea" }, { name: "Cal" }, { name: "Dot" }] },
    headers,
  });
  const [bea = "", cal = "", dot = ""] = (
    (await added.json()) as { players: { id: string }[] }
  ).players.map((p) => p.id);
  const start = Date.now() - 14 * 86_400_000;
  const game = (i: number, mine: string[], theirs: string[], won: boolean) => ({
    playedAt: new Date(start + i * 86_400_000).toISOString(),
    teams: [
      { playerIds: mine, rank: won ? 1 : 2 },
      { playerIds: theirs, rank: won ? 2 : 1 },
    ],
  });
  const matches = [
    ...[true, true, true, true, false, false].map((won, i) =>
      game(i, [ann, bea], [cal, dot], won),
    ),
    ...[true, true, true, false, false, false].map((won, i) =>
      game(6 + i, [ann, cal], [bea, dot], won),
    ),
  ];
  await page.request.post(`/api/groups/${gid}/matches`, {
    data: { matches },
    headers,
  });
  return gid;
}

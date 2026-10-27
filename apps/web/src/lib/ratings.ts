import {
  leaderboard,
  ratingSeries,
  ratingSystem,
  replay,
  resolveRatingConfig,
} from "@mmr/core";
import { useMemo } from "react";

import type { GroupData } from "./groups";

/** Ratings change with the snapshot and, through decay, with the day (PLAN §9). */
function useAsOfDay() {
  const day = new Date().toDateString();
  return useMemo(() => ({ day, asOf: new Date().toISOString() }), [day]);
}

export function useLeaderboard(data: GroupData) {
  const { day, asOf } = useAsOfDay();
  const { version, ratingConfig } = data.group;
  return useMemo(
    () => leaderboard(data.matches, resolveRatingConfig(ratingConfig), asOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the version identifies the snapshot
    [version, day],
  );
}

export function useReplay(data: GroupData) {
  const { day, asOf } = useAsOfDay();
  const { version, ratingConfig } = data.group;
  return useMemo(
    () => replay(data.matches, resolveRatingConfig(ratingConfig), asOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the version identifies the snapshot
    [version, day],
  );
}

export function useRatingSeries(data: GroupData) {
  const { day, asOf } = useAsOfDay();
  const { version, ratingConfig } = data.group;
  return useMemo(
    () => ratingSeries(data.matches, resolveRatingConfig(ratingConfig), asOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the version identifies the snapshot
    [version, day],
  );
}

/** Predicted win probability per team from current ratings (MATCH-016). */
export function usePredictWin(data: GroupData) {
  const { players } = useReplay(data);
  const { ratingConfig } = data.group;
  return useMemo(() => {
    const system = ratingSystem(resolveRatingConfig(ratingConfig));
    return (teams: string[][]) =>
      system.predictWin(
        teams.map((t) => t.map((id) => players.get(id) ?? system.initial())),
      );
  }, [players, ratingConfig]);
}

export type Role = "owner" | "admin" | "recorder" | "viewer";
export type DefaultRole = Extract<Role, "recorder" | "viewer">;
export type Visibility = "private" | "public";
export type ScoringMode = "required" | "optional" | "none";

export type TeamFormat =
  { kind: "fixed"; teams: number; size: number } | { kind: "flexible" };

export interface MatchTeam {
  playerIds: string[];
  score: number | null;
  /** 1 = best; ties share a rank. */
  rank: number;
}

export interface RatingConfig {
  mu: number;
  sigma: number;
  tau: number;
  /** σ² grows by decayPerWeek² per week inactive. */
  decayPerWeek: number;
  provisionalSigma: number;
  useScores: boolean;
}

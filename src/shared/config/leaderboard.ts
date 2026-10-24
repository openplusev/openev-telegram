export const LEADERBOARD_PERIODS = [
  { name: "Last 30 days", value: "30d" },
  { name: "Last 90 days", value: "90d" },
  { name: "Last year", value: "1y" },
  { name: "All time", value: "all" },
] as const;

export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number]["value"];

export function isLeaderboardPeriod(
  value: unknown,
): value is LeaderboardPeriod {
  return LEADERBOARD_PERIODS.some((p) => p.value === value);
}

export function periodLabel(key: string): string {
  return LEADERBOARD_PERIODS.find((p) => p.value === key)?.name ?? key;
}

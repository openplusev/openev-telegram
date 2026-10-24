import {
  MESSAGE_BUDGET,
  fitLines,
  formatRecord,
  formatRoi,
  formatUnits,
} from "@/core/utils/format.utils";
import { esc, link } from "@/core/utils/html.utils";
import type { LeaderboardResponse } from "@/lib/api";
import { BOT_NAME, profileUrl } from "@/shared/config/branding";
import {
  type LeaderboardPeriod,
  periodLabel,
} from "@/shared/config/leaderboard";
import { type SportKey, sportLabel } from "@/shared/config/sports";

export function leaderboardMessage(
  board: LeaderboardResponse,
  sport: SportKey | null,
  period: LeaderboardPeriod,
): string {
  const lines = board.rows
    .slice(0, 10)
    .map(
      (r) =>
        `${r.rank}. <b>${link(profileUrl(r.username), r.username)}</b> ROI ${esc(formatRoi(r.roi))}, ${esc(formatUnits(r.units))}, ${esc(formatRecord(r))} (${r.graded} graded)`,
    );
  return [
    `<b>Leaderboard: ${esc(sport ? sportLabel(sport) : "All sports")}, ${esc(periodLabel(period))}</b>`,
    lines.length ? fitLines(lines, MESSAGE_BUDGET) : "No ranked cappers yet.",
    `<i>${esc(BOT_NAME)} verified record. Minimum ${esc(board.minGraded)} graded picks to rank, ${esc(board.total)} ranked</i>`,
  ].join("\n");
}

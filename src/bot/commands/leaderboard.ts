import { leaderboardMessage } from "@/core/messages/leaderboard.message";
import { replyFailure, replyHtml } from "@/core/utils/reply.utils";
import { ApiError, api } from "@/lib/api";
import {
  LEADERBOARD_PERIODS,
  type LeaderboardPeriod,
  isLeaderboardPeriod,
} from "@/shared/config/leaderboard";
import { SPORTS, type SportKey } from "@/shared/config/sports";
import { Composer } from "grammy";

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Telegram commands have no options, so "nba 90d" or "epl all" is parsed from free text.
function findSport(token: string): SportKey | null {
  const t = normalize(token);
  if (t.length < 3) return null;
  const sport = SPORTS.find(
    (s) =>
      s.value === token ||
      normalize(s.name) === t ||
      normalize(s.name).endsWith(t),
  );
  return sport?.value ?? null;
}

const USAGE = `Use /leaderboard [sport] [period]. Sports: ${SPORTS.map((s) => s.name).join(", ")}. Periods: ${LEADERBOARD_PERIODS.map((p) => p.value).join(", ")}.`;

export const leaderboardCommand = new Composer();

leaderboardCommand.command("leaderboard", async (ctx) => {
  let sport: SportKey | null = null;
  let period: LeaderboardPeriod = "30d";
  for (const token of ctx.match.trim().split(/\s+/).filter(Boolean)) {
    const lower = token.toLowerCase();
    if (isLeaderboardPeriod(lower)) {
      period = lower;
      continue;
    }
    const found = findSport(token);
    if (!found) {
      await replyHtml(ctx, USAGE);
      return;
    }
    sport = found;
  }
  try {
    const board = await api.leaderboard(sport, period);
    await replyHtml(ctx, leaderboardMessage(board, sport, period));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      await replyHtml(ctx, "The leaderboard is coming soon.");
      return;
    }
    await replyFailure(ctx, err);
  }
});

import { helpCommand } from "@/bot/commands/help";
import { leaderboardCommand } from "@/bot/commands/leaderboard";
import { pickCommand } from "@/bot/commands/pick";
import { recapCommand } from "@/bot/commands/recap";
import { recordCommand } from "@/bot/commands/record";
import { verifyCommand } from "@/bot/commands/verify";
import type { Bot } from "grammy";

export function registerCommands(bot: Bot): void {
  bot.use(
    helpCommand,
    pickCommand,
    recapCommand,
    recordCommand,
    leaderboardCommand,
    verifyCommand,
  );
}

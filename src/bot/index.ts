import { alertsCommand } from "@/bot/commands/alerts";
import { helpCommand } from "@/bot/commands/help";
import { meCommand } from "@/bot/commands/me";
import type { Bot } from "grammy";

export function registerCommands(bot: Bot): void {
  bot.use(helpCommand, alertsCommand, meCommand);
}

import { registerCommands } from "@/bot";
import type { OutgoingMessage } from "@/core/messages/alert.message";
import { runDryRun } from "@/core/services/dry-run";
import { startAlertsFeed } from "@/core/services/alerts.feed";
import { loadChatSettings } from "@/core/services/chat-settings";
import { startQueue } from "@/core/services/send.queue";
import { startSubscribers } from "@/core/services/subscribers";
import { logger } from "@/lib/logger";
import { EVENTS_URL } from "@/lib/openev/events";
import { COMMANDS } from "@/shared/config/commands";
import { DRY_RUN, INTERNAL_TOKEN, OPENEV_API_URL } from "@/shared/config/env";
import { Bot, GrammyError, HttpError } from "grammy";

const FALLBACK = "Something went wrong. Try again in a moment.";

// Log and keep running: bot.catch covers handlers, these cover timers and sockets.
process.on("unhandledRejection", (reason) =>
  logger.error("Unhandled rejection", { error: String(reason) }),
);
process.on("uncaughtException", (err) =>
  logger.error("Uncaught exception", { error: String(err) }),
);

async function startBot(token: string): Promise<void> {
  if (!INTERNAL_TOKEN) {
    logger.warn("INTERNAL_TOKEN is not set, personal alerts and linking fail");
  }
  const bot = new Bot(token);
  registerCommands(bot);

  bot.catch(async ({ ctx, error }) => {
    logger.error("Unhandled handler error", {
      updateId: ctx.update.update_id,
      error:
        error instanceof GrammyError || error instanceof HttpError
          ? error.message
          : error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
    });
    if (ctx.chat) await ctx.reply(FALLBACK).catch(() => {});
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      logger.info("Stopping", { signal });
      void bot.stop().finally(() => process.exit(0));
    });
  }

  await bot.init();
  await bot.api.setMyCommands(COMMANDS);
  await loadChatSettings();
  await startSubscribers();
  startQueue(async (chatId: number, message: OutgoingMessage) => {
    await bot.api.sendMessage(chatId, message.text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: message.keyboard,
    });
  });
  await startAlertsFeed();
  await bot.start({
    allowed_updates: ["message", "channel_post"],
    onStart: (me) =>
      logger.info("Bot started", {
        username: me.username,
        api: OPENEV_API_URL,
        events: EVENTS_URL,
      }),
  });
}

async function main(): Promise<void> {
  if (DRY_RUN) {
    await runDryRun();
    return;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    logger.error("TELEGRAM_BOT_TOKEN is not set, exiting");
    process.exit(1);
  }
  await startBot(token);
}

main().catch((err) => {
  logger.error("Startup failed", { error: String(err) });
  process.exit(1);
});

import { registerCommands } from "@/bot";
import { startResultsFeed } from "@/core/services/results.feed";
import { logger } from "@/lib/logger";
import { COMMANDS } from "@/shared/config/commands";
import { Bot, GrammyError, HttpError } from "grammy";

const FALLBACK = "Something went wrong. Try again in a moment.";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) {
  logger.error("TELEGRAM_BOT_TOKEN is not set, exiting");
  process.exit(1);
}
if (!process.env.BOT_API_TOKEN?.trim()) {
  logger.warn("BOT_API_TOKEN is not set, API calls will be rejected");
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
  if (ctx.callbackQuery) {
    await ctx
      .answerCallbackQuery({ text: FALLBACK, show_alert: true })
      .catch(() => {});
    return;
  }
  if (ctx.chat) await ctx.reply(FALLBACK).catch(() => {});
});

// Log and keep running: bot.catch covers handlers, these cover timers.
process.on("unhandledRejection", (reason) =>
  logger.error("Unhandled rejection", { error: String(reason) }),
);
process.on("uncaughtException", (err) =>
  logger.error("Uncaught exception", { error: String(err) }),
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    logger.info("Stopping", { signal });
    void bot.stop().finally(() => process.exit(0));
  });
}

async function main() {
  await bot.init();
  await bot.api.setMyCommands(COMMANDS);
  await startResultsFeed(bot.api);
  await bot.start({
    allowed_updates: ["message", "callback_query"],
    onStart: (me) => logger.info("Bot started", { username: me.username }),
  });
}

main().catch((err) => {
  logger.error("Startup failed", { error: String(err) });
  process.exit(1);
});

import {
  HELP,
  LINK_INVALID,
  LINK_UNAVAILABLE,
  linkedMessage,
} from "@/core/messages/help.message";
import {
  clearBlocked,
  isMuted,
  refreshSubscribers,
  setMuted,
} from "@/core/services/subscribers";
import { replyHtml } from "@/core/utils/reply.utils";
import { linkTelegram } from "@/lib/openev/internal";
import { Composer } from "grammy";

// Telegram deep link payloads allow only these characters, at most 64.
const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

export const helpCommand = new Composer();

helpCommand.command("help", async (ctx) => {
  await replyHtml(ctx, HELP);
});

helpCommand.command("start", async (ctx) => {
  const token = ctx.match.trim();
  const chat = ctx.chat;

  if (!token) {
    if (chat.type === "private" && isMuted(chat.id)) {
      await setMuted(chat.id, false);
      await replyHtml(ctx, `<b>Personal alerts resumed.</b>\n\n${HELP}`);
      return;
    }
    await replyHtml(ctx, HELP);
    return;
  }

  if (chat.type !== "private") {
    await replyHtml(
      ctx,
      "Open the Connect Telegram link in a private chat with the bot.",
    );
    return;
  }
  if (!TOKEN.test(token)) {
    await replyHtml(ctx, LINK_INVALID);
    return;
  }

  const result = await linkTelegram(token, chat.id, ctx.from?.username ?? null);
  if (!result.ok) {
    await replyHtml(
      ctx,
      result.reason === "invalid_token" ? LINK_INVALID : LINK_UNAVAILABLE,
    );
    return;
  }
  await setMuted(chat.id, false);
  await clearBlocked(result.userId);
  await refreshSubscribers();
  await replyHtml(ctx, linkedMessage(result.displayName));
});

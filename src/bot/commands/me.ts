import {
  NOT_LINKED,
  personalStatusMessage,
} from "@/core/messages/settings.message";
import {
  isBlocked,
  isMuted,
  setMuted,
  subscriberForChat,
} from "@/core/services/subscribers";
import { replyHtml } from "@/core/utils/reply.utils";
import { Composer } from "grammy";

const PRIVATE_ONLY =
  "Personal alerts live in a private chat with the bot. Message me directly.";

export const meCommand = new Composer();

meCommand.command("me", async (ctx) => {
  if (ctx.chat.type !== "private") {
    await replyHtml(ctx, PRIVATE_ONLY);
    return;
  }
  const s = subscriberForChat(ctx.chat.id);
  if (!s) {
    await replyHtml(ctx, NOT_LINKED);
    return;
  }
  await replyHtml(
    ctx,
    personalStatusMessage(s, isMuted(ctx.chat.id), isBlocked(s)),
  );
});

meCommand.command("stop", async (ctx) => {
  if (ctx.chat.type !== "private") {
    await replyHtml(ctx, `${PRIVATE_ONLY} Group alerts stop with /alerts off.`);
    return;
  }
  await setMuted(ctx.chat.id, true);
  await replyHtml(
    ctx,
    "<b>Personal alerts paused in this chat.</b>\nSend /start to resume. Your filters on the website stay as they are.",
  );
});

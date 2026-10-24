import { recordMessage } from "@/core/messages/record.message";
import { replyFailure, replyHtml } from "@/core/utils/reply.utils";
import { api } from "@/lib/api";
import { Composer } from "grammy";

const USERNAME = /^[A-Za-z0-9_.]{1,64}$/;

export const recordCommand = new Composer();

recordCommand.command("record", async (ctx) => {
  const username = ctx.match.trim().replace(/^@/, "") || ctx.from?.username;
  if (!username) {
    await replyHtml(
      ctx,
      "You have no Telegram username set. Give one, like /record alice.",
    );
    return;
  }
  if (!USERNAME.test(username)) {
    await replyHtml(ctx, "Give a username, like /record alice.");
    return;
  }
  try {
    await replyHtml(ctx, recordMessage(await api.userStats(username)));
  } catch (err) {
    await replyFailure(ctx, err);
  }
});

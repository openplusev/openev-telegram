import { recapMessage } from "@/core/messages/recap.message";
import { guildIdFor } from "@/core/services/results.feed";
import { replyFailure, replyHtml } from "@/core/utils/reply.utils";
import { api } from "@/lib/api";
import { Composer } from "grammy";

const DAY_MS = 24 * 60 * 60 * 1000;

export const recapCommand = new Composer();

recapCommand.command("recap", async (ctx) => {
  const arg = ctx.match.trim();
  const days = arg ? Number(arg) : 7;
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    await replyHtml(
      ctx,
      "Give a number of days from 1 to 365, like /recap 30.",
    );
    return;
  }
  try {
    const to = new Date();
    const from = new Date(to.getTime() - days * DAY_MS);
    const recap = await api.recap(guildIdFor(ctx.chat.id), from, to);
    await replyHtml(ctx, recapMessage(recap, days));
  } catch (err) {
    await replyFailure(ctx, err);
  }
});

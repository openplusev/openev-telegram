import { esc } from "@/core/utils/html.utils";
import { ApiError } from "@/lib/api";
import { type Context, GrammyError, type InlineKeyboard } from "grammy";

export async function replyHtml(
  ctx: Context,
  text: string,
  keyboard?: InlineKeyboard,
) {
  return ctx.reply(text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: keyboard,
    ...(ctx.msg
      ? {
          reply_parameters: {
            message_id: ctx.msg.message_id,
            allow_sending_without_reply: true,
          },
        }
      : {}),
  });
}

// Editing without a keyboard removes the old one, which is how finished flows close.
export async function editHtml(
  ctx: Context,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  try {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard,
    });
  } catch (err) {
    if (
      err instanceof GrammyError &&
      err.description.includes("message is not modified")
    ) {
      return;
    }
    throw err;
  }
}

// API errors carry a user facing message; anything else goes to bot.catch.
export async function replyFailure(ctx: Context, err: unknown): Promise<void> {
  if (!(err instanceof ApiError)) throw err;
  await replyHtml(ctx, esc(err.message));
}

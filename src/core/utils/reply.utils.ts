import type { Context, InlineKeyboard } from "grammy";

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

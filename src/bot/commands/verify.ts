import { esc } from "@/core/utils/html.utils";
import { replyHtml } from "@/core/utils/reply.utils";
import { verifyUrl } from "@/shared/config/branding";
import { Composer, InlineKeyboard } from "grammy";

const PICK_REF = /^[A-Za-z0-9_-]{1,64}$/;

export const verifyCommand = new Composer();

verifyCommand.command("verify", async (ctx) => {
  const ref = ctx.match.trim().replace(/^#/, "");
  if (!PICK_REF.test(ref)) {
    await replyHtml(ctx, "Give a pick number or id, like /verify 42.");
    return;
  }
  const url = verifyUrl(ref);
  await replyHtml(
    ctx,
    `Pick ${esc(/^\d+$/.test(ref) ? `#${ref}` : ref)}: ${esc(url)}`,
    new InlineKeyboard().url("Verify pick", url),
  );
});

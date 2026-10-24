import { esc, link } from "@/core/utils/html.utils";
import { replyHtml } from "@/core/utils/reply.utils";
import { BOT_NAME, WEBSITE_URL } from "@/shared/config/branding";
import { COMMANDS } from "@/shared/config/commands";
import { Composer } from "grammy";

const HELP = [
  `<b>${esc(BOT_NAME)}</b>: an honest, verified record for every bettor.`,
  "Picks are locked at odds the platform captures, graded automatically and can never be edited or deleted.",
  "",
  ...COMMANDS.map((c) => `/${c.command}: ${esc(c.description)}`),
  "",
  "Settled picks are posted in every chat where a pick was made.",
  link(WEBSITE_URL, WEBSITE_URL.replace(/^https?:\/\//, "")),
].join("\n");

export const helpCommand = new Composer();

helpCommand.command(["start", "help"], async (ctx) => {
  await replyHtml(ctx, HELP);
});

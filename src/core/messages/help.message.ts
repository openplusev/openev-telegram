import { esc, link } from "@/core/utils/html.utils";
import {
  BOT_NAME,
  OPENEV_WEBSITE_URL,
  SETTINGS_URL,
} from "@/shared/config/branding";
import { COMMANDS } from "@/shared/config/commands";

export const HELP = [
  `<b>${esc(BOT_NAME)}</b>: value bets and arbs from 35 bookmakers, priced against Pinnacle.`,
  "Every alert lands in a public ledger with its closing line, so the record can be checked.",
  "",
  "<b>Groups and channels</b>: add the bot, then an admin sends /alerts on.",
  `<b>Personal alerts</b>: press Connect Telegram in ${link(SETTINGS_URL, "settings")}; stakes are sized from your bankroll.`,
  "",
  ...COMMANDS.map((c) => `/${c.command}: ${esc(c.description)}`),
  "",
  link(OPENEV_WEBSITE_URL, OPENEV_WEBSITE_URL.replace(/^https?:\/\//, "")),
].join("\n");

export function linkedMessage(displayName: string): string {
  return [
    `<b>Linked to ${esc(BOT_NAME)} as ${esc(displayName)}.</b>`,
    "Personal alerts that match your filters arrive here, with stakes sized from your bankroll.",
    `Filters, bankroll and Kelly fraction live in ${link(SETTINGS_URL, "settings")}.`,
    "/me shows your status, /stop pauses alerts here.",
  ].join("\n");
}

export const LINK_INVALID = [
  "<b>That link did not work.</b>",
  `It has expired or was already used. Press Connect Telegram in ${link(SETTINGS_URL, "settings")} again for a new one.`,
].join("\n");

export const LINK_UNAVAILABLE =
  "Linking is not available right now. Try the link again in a few minutes.";

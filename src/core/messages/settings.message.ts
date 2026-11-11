import type { ChatAlertSettings } from "@/core/services/chat-settings";
import { kellyLabel, percent } from "@/core/utils/format.utils";
import { esc, link } from "@/core/utils/html.utils";
import type { Subscriber } from "@/lib/openev/internal";
import { PROOF_URL, SETTINGS_URL } from "@/shared/config/branding";
import { CONFIDENCE_LABEL, bookName } from "@/shared/config/openev";

function booksText(books: string[]): string {
  return books.length
    ? books.map((b) => `${bookName(b)} (${b})`).join(", ")
    : "All books";
}

export const ALERTS_USAGE = [
  "<b>Change them</b> (admins only in groups):",
  "/alerts on, /alerts off",
  "/alerts ev 3: minimum EV in percent, from 2",
  "/alerts confidence low|medium|high",
  "/alerts books ubuk ladbrokes, or /alerts books all",
  "/alerts arbs on 1.5: arbs from 1.5% profit, /alerts arbs off",
].join("\n");

export function chatSettingsMessage(s: ChatAlertSettings): string {
  return [
    `<b>Value bet alerts in this chat: ${s.enabled ? "on" : "off"}</b>`,
    s.enabled
      ? `Alerts are posted as the ${link(PROOF_URL, "public ledger")} records them.`
      : "Turn them on with /alerts on.",
    "",
    `Minimum EV: ${percent(s.minEv)}`,
    `Minimum confidence: ${CONFIDENCE_LABEL[s.minConfidence]}`,
    `Books: ${esc(booksText(s.books))}`,
    `Arbs: ${s.arbs ? `on from ${percent(s.minArbProfit)}` : "off"}`,
  ].join("\n");
}

export function personalStatusMessage(
  s: Subscriber,
  muted: boolean,
  blocked: boolean,
): string {
  const p = s.prefs;
  const state = !p.telegram
    ? "off for Telegram (turn on the Telegram channel in settings)"
    : !p.enabled
      ? "off (turn alerts on in settings)"
      : muted
        ? "paused with /stop (send /start to resume)"
        : blocked
          ? "paused, the bot was blocked"
          : "on";
  return [
    `<b>Linked as ${esc(s.displayName)}</b>`,
    `Personal alerts: ${esc(state)}`,
    "",
    `Minimum EV: ${percent(p.minEv)}`,
    `Minimum confidence: ${CONFIDENCE_LABEL[p.minConfidence]}`,
    `Books: ${esc(booksText(p.books))}`,
    `Arbs: ${p.arbs ? `on from ${percent(p.minArbProfit)}` : "off"}`,
    `Stakes: ${esc(kellyLabel(s.kellyFraction))} of a bankroll of ${Math.round(s.bankroll)} ${esc(s.currency)}`,
    "",
    `Change filters and bankroll in ${link(SETTINGS_URL, "settings")}.`,
  ].join("\n");
}

export const NOT_LINKED = [
  "<b>This chat is not linked to an OpenEV account.</b>",
  `Open ${link(SETTINGS_URL, "settings")}, sign in with Discord and press Connect Telegram. Telegram opens this bot and links the chat.`,
].join("\n");

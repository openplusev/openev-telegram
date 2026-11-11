import {
  decimalOdds,
  formatKickoff,
  kelly,
  kellyLabel,
  leagueName,
  marketName,
  percent,
  sideName,
} from "@/core/utils/format.utils";
import { esc } from "@/core/utils/html.utils";
import type { LedgerEntry, ValueBet } from "@/lib/openev/client";
import { betUrl, gameUrl } from "@/shared/config/branding";
import { CONFIDENCE_LABEL, bookName } from "@/shared/config/openev";
import { InlineKeyboard } from "grammy";

export const CHECK_PRICE = "Check the price at the book before betting.";

const CHAT_BANKROLL = 1000;
const CHAT_KELLY = 0.25;

export interface OutgoingMessage {
  text: string;
  keyboard: InlineKeyboard;
}

export interface Staking {
  bankroll: number;
  kellyFraction: number;
  currency: string;
}

export function linkKeyboard(
  links: { label: string; url: string }[],
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const l of links) keyboard.url(l.label, l.url);
  return keyboard;
}

// Without personal staking, groups get the stake per 1000 at quarter Kelly.
function stakeLine(entry: LedgerEntry, staking: Staking | null): string {
  const odds = Number(entry.alert_odds);
  const probability = 1 / Number(entry.alert_fair_odds);
  if (!staking) {
    const stake = Math.round(
      kelly(odds, probability, CHAT_KELLY) * CHAT_BANKROLL,
    );
    return `Stake: <b>${stake}</b> per ${CHAT_BANKROLL}, ${kellyLabel(CHAT_KELLY)}`;
  }
  const stake = Math.round(
    kelly(odds, probability, staking.kellyFraction) * staking.bankroll,
  );
  return `Stake: <b>${stake} ${esc(staking.currency)}</b>, ${esc(kellyLabel(staking.kellyFraction))} of ${Math.round(staking.bankroll)}`;
}

// `live` is the bet as the API sees it now: null once the price is gone, undefined when unknown.
export function alertMessage(
  entry: LedgerEntry,
  live: ValueBet | null | undefined,
  staking: Staking | null,
): OutgoingMessage {
  const odds = Number(entry.alert_odds);
  const samePrice = live != null && Number(live.odds) === odds;

  let oddsLine = `Odds <b>${decimalOdds(odds)}</b>, fair ${decimalOdds(entry.alert_fair_odds)}`;
  if (live && !samePrice) oddsLine += `, now ${decimalOdds(live.odds)}`;
  if (live === null) oddsLine += ", price gone";

  let evLine = `EV <b>${percent(entry.alert_ev)}</b>`;
  if (samePrice) evLine += `, safe ${percent(live.ev_conservative)}`;

  const lines = [
    `<b>${esc(sideName(entry))}</b> at <b>${esc(bookName(entry.book))}</b>`,
    `${esc(entry.home)} vs ${esc(entry.away)}, ${esc(marketName(entry))}`,
    esc(leagueName(entry.league)),
    "",
    oddsLine,
    evLine,
    `Confidence: ${CONFIDENCE_LABEL[entry.confidence]}`,
    `Kickoff: ${esc(formatKickoff(entry.starts_at))}`,
    stakeLine(entry, staking),
    "",
    `<i>${CHECK_PRICE}</i>`,
  ];

  return {
    text: lines.join("\n"),
    keyboard: linkKeyboard([
      { label: "Bet details", url: betUrl(entry.id) },
      { label: "Game", url: gameUrl(entry.game_id) },
    ]),
  };
}

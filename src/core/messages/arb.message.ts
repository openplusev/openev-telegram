import {
  CHECK_PRICE,
  type OutgoingMessage,
  linkKeyboard,
} from "@/core/messages/alert.message";
import {
  decimalOdds,
  formatKickoff,
  leagueName,
  marketName,
  percent,
  sideName,
} from "@/core/utils/format.utils";
import { esc } from "@/core/utils/html.utils";
import type { Arb } from "@/lib/openev/client";
import { ARBS_URL, gameUrl } from "@/shared/config/branding";
import { bookName } from "@/shared/config/openev";

const TOTAL_STAKE = 1000;

export function arbMessage(arb: Arb): OutgoingMessage {
  const legs = arb.legs.map(
    (leg) =>
      `${esc(sideName({ ...arb, side: leg.side }))} at ${esc(bookName(leg.book))}: <b>${decimalOdds(leg.odds)}</b>, stake ${Math.round(leg.stake_share * TOTAL_STAKE)} of ${TOTAL_STAKE}`,
  );
  const lines = [
    `<b>Arb ${percent(arb.profit)}</b>: ${esc(arb.home)} vs ${esc(arb.away)}`,
    `${esc(marketName(arb))}, ${esc(leagueName(arb.league))}`,
    "",
    ...legs,
    "",
    `Kickoff: ${esc(formatKickoff(arb.starts_at))}`,
    "",
    `<i>${CHECK_PRICE}</i>`,
  ];
  return {
    text: lines.join("\n"),
    keyboard: linkKeyboard([
      { label: "All arbs", url: ARBS_URL },
      { label: "Game", url: gameUrl(arb.game_id) },
    ]),
  };
}

import { formatOdds, formatRoi, formatUnits } from "@/core/utils/format.utils";
import { esc, link } from "@/core/utils/html.utils";
import { matchupTitle, pickAuthor } from "@/core/utils/pick.utils";
import type { ApiSettledPick, PickResult } from "@/lib/api";
import { profileUrl, verifyUrl } from "@/shared/config/branding";
import { marketLabel } from "@/shared/config/sports";

const LABELS: Record<PickResult, string> = {
  pending: "Pending",
  win: "Win",
  loss: "Loss",
  push: "Push",
  void: "Void",
};

// Odds are American, so profit per unit staked is odds/100 or 100/|odds|.
export function unitsResult(pick: ApiSettledPick): number {
  if (pick.result === "loss") return -pick.units;
  if (pick.result !== "win") return 0;
  const perUnit = pick.odds > 0 ? pick.odds / 100 : 100 / Math.abs(pick.odds);
  return pick.units * perUnit;
}

export function resultMessage(pick: ApiSettledPick): string {
  const odds =
    pick.closingOdds == null
      ? formatOdds(pick.odds)
      : `${formatOdds(pick.odds)}, closed ${formatOdds(pick.closingOdds)}`;
  return [
    `<b>${esc(LABELS[pick.result])} ${esc(formatUnits(unitsResult(pick)))}</b>: ${esc(matchupTitle(pick))}`,
    esc(pickAuthor(pick)),
    `<b>${esc(pick.selection)}</b> (${esc(marketLabel(pick.market))}), ${esc(pick.units)}u`,
    `Odds ${esc(odds)}${pick.clv == null ? "" : `, CLV ${esc(formatRoi(pick.clv))}`}`,
    `${link(profileUrl(pick.username), "View profile")}, ${link(verifyUrl(pick.id), "Verify")}`,
    `<i>Pick #${esc(pick.sequence)} settled</i>`,
  ].join("\n");
}

import { formatOdds, formatUtc } from "@/core/utils/format.utils";
import { esc, link } from "@/core/utils/html.utils";
import { matchupTitle, pickAuthor } from "@/core/utils/pick.utils";
import type { ApiPick } from "@/lib/api";
import { profileUrl, verifyUrl } from "@/shared/config/branding";
import { marketLabel } from "@/shared/config/sports";

export function pickMessage(pick: ApiPick): string {
  return [
    `<b>Locked: pick #${esc(pick.sequence)}</b>`,
    esc(pickAuthor(pick)),
    esc(matchupTitle(pick)),
    `<b>${esc(pick.selection)}</b> (${esc(marketLabel(pick.market))}), ${esc(pick.units)}u`,
    `Odds ${esc(formatOdds(pick.odds))} at ${esc(pick.bookmaker)}, captured ${esc(formatUtc(pick.createdAt))}`,
    `Starts ${esc(formatUtc(pick.commenceTime))}`,
    `${link(profileUrl(pick.username), "View profile")}, ${link(verifyUrl(pick.id), "Verify")}`,
  ].join("\n");
}

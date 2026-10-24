import {
  MESSAGE_BUDGET,
  fitLines,
  formatRecord,
  formatRoi,
  formatUnits,
} from "@/core/utils/format.utils";
import { esc, link } from "@/core/utils/html.utils";
import type { RecapResponse } from "@/lib/api";
import { BOT_NAME, profileUrl } from "@/shared/config/branding";

export function recapMessage(recap: RecapResponse, days: number): string {
  const cappers = [...recap.cappers].sort((a, b) => b.units - a.units);
  const lines = cappers.map(
    (c, i) =>
      `${i + 1}. ${link(profileUrl(c.username), c.username)} ${esc(formatRecord(c))}, ${esc(formatUnits(c.units))}, ROI ${esc(formatRoi(c.roi))}`,
  );
  const total = cappers.reduce((sum, c) => sum + c.units, 0);
  return [
    `<b>Recap: last ${days} day${days === 1 ? "" : "s"}</b>`,
    lines.length
      ? fitLines(lines, MESSAGE_BUDGET)
      : "No graded picks in this period.",
    `<i>${esc(BOT_NAME)} verified record. Chat total ${esc(formatUnits(total))}</i>`,
  ].join("\n");
}

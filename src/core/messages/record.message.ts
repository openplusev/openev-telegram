import {
  formatRecord,
  formatRoi,
  formatUnits,
} from "@/core/utils/format.utils";
import { esc, link } from "@/core/utils/html.utils";
import type { CapperStats } from "@/lib/api";
import { BOT_NAME, profileUrl } from "@/shared/config/branding";

export function recordMessage(stats: CapperStats): string {
  return [
    `<b>${link(profileUrl(stats.username), stats.username)}</b>`,
    `Record ${esc(formatRecord(stats))}, ${esc(formatUnits(stats.units))}, ROI ${esc(formatRoi(stats.roi))}`,
    `Picks ${esc(stats.picks)}, pending ${esc(stats.pending)}`,
    `<i>${esc(BOT_NAME)} verified record</i>`,
  ].join("\n");
}

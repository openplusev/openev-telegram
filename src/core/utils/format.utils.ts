// Telegram caps a message at 4096 characters; leave room for header and footer.
export const MESSAGE_BUDGET = 3800;

export function fitLines(lines: string[], limit: number): string {
  let content = "";
  for (const line of lines) {
    if (content.length + line.length + 1 > limit) break;
    content += (content ? "\n" : "") + line;
  }
  return content;
}

export function formatUnits(units: number): string {
  return `${units > 0 ? "+" : ""}${units.toFixed(2)}u`;
}

export function formatRoi(roi: number): string {
  return `${roi > 0 ? "+" : ""}${(roi * 100).toFixed(1)}%`;
}

export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : String(odds);
}

export function formatRecord(s: {
  wins: number;
  losses: number;
  pushes: number;
}): string {
  return `${s.wins}W ${s.losses}L${s.pushes ? ` ${s.pushes}P` : ""}`;
}

export function formatUtc(iso: string): string {
  const when = new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
  return `${when} UTC`;
}

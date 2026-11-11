export const BOT_NAME = "OpenEV";

export const OPENEV_WEBSITE_URL = (
  process.env.OPENEV_WEBSITE_URL?.trim() || "https://openev.coding-global.com"
).replace(/\/+$/, "");

const SITE = `${OPENEV_WEBSITE_URL}/en`;

export function betUrl(id: string): string {
  return `${SITE}/value-bets/${encodeURIComponent(id)}`;
}

export function gameUrl(id: string): string {
  return `${SITE}/games/${encodeURIComponent(id)}`;
}

export const ARBS_URL = `${SITE}/arbs`;
export const PROOF_URL = `${SITE}/proof`;
export const SETTINGS_URL = `${SITE}/settings`;

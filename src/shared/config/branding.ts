export const BOT_NAME = "OpenCapper";
export const WEBSITE_URL = (
  process.env.WEBSITE_URL?.trim() || "https://opencapper.coding-global.com"
).replace(/\/+$/, "");

export function profileUrl(username: string): string {
  return `${WEBSITE_URL}/en/u/${encodeURIComponent(username)}`;
}

export function verifyUrl(pick: string): string {
  return `${WEBSITE_URL}/en/verify?pick=${encodeURIComponent(pick)}`;
}

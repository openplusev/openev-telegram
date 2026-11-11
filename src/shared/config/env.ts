export const DRY_RUN = ["1", "true", "yes"].includes(
  process.env.DRY_RUN?.trim().toLowerCase() ?? "",
);

export const OPENEV_API_URL = (
  process.env.OPENEV_API_URL?.trim() || "http://openev-api:8080"
).replace(/\/+$/, "");

export const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN?.trim() ?? "";

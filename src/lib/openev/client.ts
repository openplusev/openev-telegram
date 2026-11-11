import type { components, paths } from "@/lib/openev/schema";
import { OPENEV_API_URL } from "@/shared/config/env";
import createClient from "openapi-fetch";

type Schemas = components["schemas"];
export type LedgerEntry = Schemas["LedgerEntry"];
export type ValueBet = Schemas["ValueBet"];
export type Arb = Schemas["Arb"];
export type Confidence = Schemas["Confidence"];
export type ServerMessage = Schemas["ServerMessage"];

const TIMEOUT_MS = 10_000;

const openev = createClient<paths>({ baseUrl: OPENEV_API_URL });

function failed(path: string, status: number): Error {
  return new Error(`OpenEV ${path} answered ${status}`);
}

// Newest first, the same rows as the public proof page.
export async function fetchLedger(limit: number): Promise<LedgerEntry[]> {
  const res = await openev.GET("/v1/ledger", {
    params: { query: { limit } },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.data) throw failed("/v1/ledger", res.response.status);
  return res.data.entries;
}

// The API answers 404 once the price is no longer a value bet.
export async function fetchValueBet(id: string): Promise<ValueBet | null> {
  const res = await openev.GET("/v1/value-bets/{id}", {
    params: { path: { id } },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.data) return res.data.bet;
  if (res.response.status === 404) return null;
  throw failed("/v1/value-bets/{id}", res.response.status);
}

export async function fetchArbs(minProfit: number): Promise<Arb[]> {
  const res = await openev.GET("/v1/arbs", {
    params: { query: { min_profit: minProfit } },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.data) throw failed("/v1/arbs", res.response.status);
  return res.data;
}

export async function fetchBookCodes(): Promise<string[]> {
  const res = await openev.GET("/v1/books", {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.data) throw failed("/v1/books", res.response.status);
  return res.data.map((b) => b.book);
}

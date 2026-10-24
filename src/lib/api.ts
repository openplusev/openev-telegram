import { logger } from "@/lib/logger";
import type { LeaderboardPeriod } from "@/shared/config/leaderboard";
import type { Market, SportKey } from "@/shared/config/sports";

const API_URL = (
  process.env.OPENCAPPER_API_URL?.trim() ||
  "https://opencapper.coding-global.com/api"
).replace(/\/+$/, "");
const API_TOKEN = process.env.BOT_API_TOKEN?.trim() ?? "";
const TIMEOUT_MS = 10_000;

export type PickResult = "pending" | "win" | "loss" | "push" | "void";

export interface ApiEvent {
  id: string;
  home: string;
  away: string;
  commenceTime: string;
  homeImage?: string | null;
  awayImage?: string | null;
  homeCountry?: string | null;
  awayCountry?: string | null;
}

export interface ApiOutcome {
  name: string;
  point: number | null;
  odds: number;
  selection: string;
}

export interface ApiMarketOdds {
  market: string;
  bookmaker: string;
  outcomes: ApiOutcome[];
}

export interface ApiEventOdds {
  eventId: string;
  home: string;
  away: string;
  commenceTime: string;
  markets: ApiMarketOdds[];
}

export interface CreatePickRequest {
  telegramUserId: string;
  telegramUsername: string;
  chatId: string;
  sportKey: SportKey;
  eventId: string;
  market: Market;
  selection: string;
  units: number;
}

export interface ApiPick {
  id: string;
  sequence: number;
  username: string;
  sportKey: string;
  eventId: string;
  home: string;
  away: string;
  commenceTime: string;
  market: string;
  selection: string;
  point: number | null;
  units: number;
  odds: number;
  bookmaker: string;
  result: PickResult;
  createdAt: string;
  homeImage?: string | null;
  awayImage?: string | null;
  homeCountry?: string | null;
  awayCountry?: string | null;
  closingOdds?: number | null;
  // Fraction like roi: 0.032 is 3.2 percent.
  clv?: number | null;
  logSeq?: number | null;
}

export interface ApiSettledPick extends ApiPick {
  settledAt: string;
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  picks: number;
  graded: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  unitsRisked: number;
  roi: number;
  sports: string[];
}

export interface LeaderboardResponse {
  rows: LeaderboardRow[];
  minGraded: number;
  total: number;
}

export interface CapperStats {
  username: string;
  discordUserId: string | null;
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  units: number;
  unitsRisked: number;
  roi: number;
}

export interface RecapResponse {
  from: string;
  to: string;
  cappers: CapperStats[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    if ("error" in body && typeof body.error === "string") return body.error;
    if ("message" in body && typeof body.message === "string")
      return body.message;
  }
  return fallback;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.error("API unreachable", { method, path, error: String(err) });
    throw new ApiError("The OpenCapper API is unreachable. Try again soon.", 0);
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    logger.warn("API error", { method, path, status: res.status });
    throw new ApiError(
      errorMessage(data, `Request failed (${res.status}).`),
      res.status,
    );
  }
  // JSON boundary: the response shape is the contract documented in README.md.
  return data as T;
}

export const api = {
  events: (sport: SportKey) =>
    request<ApiEvent[]>("GET", `/events?sport=${encodeURIComponent(sport)}`),

  odds: (sport: SportKey, eventId: string) =>
    request<ApiEventOdds>(
      "GET",
      `/events/${encodeURIComponent(sport)}/${encodeURIComponent(eventId)}/odds`,
    ),

  createPick: (body: CreatePickRequest) =>
    request<ApiPick>("POST", "/picks", body),

  recap: (guildId: string, from: Date, to: Date) =>
    request<RecapResponse>(
      "GET",
      `/recap?${new URLSearchParams({
        guildId,
        from: from.toISOString(),
        to: to.toISOString(),
      })}`,
    ),

  userStats: (username: string) =>
    request<CapperStats>("GET", `/users/${encodeURIComponent(username)}/stats`),

  settledPicks: (guildId: string, since: Date) =>
    request<ApiSettledPick[]>(
      "GET",
      `/picks/settled?${new URLSearchParams({ guildId, since: since.toISOString() })}`,
    ),

  leaderboard: (sport: SportKey | null, period: LeaderboardPeriod) =>
    request<LeaderboardResponse>(
      "GET",
      `/leaderboard?${new URLSearchParams({
        ...(sport ? { sport } : {}),
        period,
        sort: "roi",
      })}`,
    ),
};

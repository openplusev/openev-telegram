import { logger } from "@/lib/logger";
import type { components, paths } from "@/lib/openev/schema";
import { finite } from "@/lib/state";
import { DRY_RUN, INTERNAL_TOKEN, OPENEV_API_URL } from "@/shared/config/env";
import type { AlertConfidence } from "@/shared/config/openev";
import createClient from "openapi-fetch";

type AlertSubscriber = components["schemas"]["AlertSubscriber"];

export interface AlertPrefs {
  enabled: boolean;
  minEv: number;
  books: string[];
  minConfidence: AlertConfidence;
  arbs: boolean;
  minArbProfit: number;
  telegram: boolean;
}

export interface Subscriber {
  userId: string;
  displayName: string;
  prefs: AlertPrefs;
  bankroll: number;
  kellyFraction: number;
  currency: string;
  telegramChatId: number | null;
}

export type LinkResult =
  | { ok: true; userId: string; displayName: string }
  | { ok: false; reason: "invalid_token" | "unavailable" };

export type DeliveryResult = "created" | "duplicate" | "failed";

const TIMEOUT_MS = 10_000;

const internal = createClient<paths>({
  baseUrl: OPENEV_API_URL,
  headers: { "X-Internal-Token": INTERNAL_TOKEN },
});

function toSubscriber(s: AlertSubscriber): Subscriber {
  return {
    userId: s.user_id,
    displayName: s.display_name,
    prefs: {
      enabled: s.prefs.enabled,
      minEv: s.prefs.min_ev,
      books: s.prefs.books,
      minConfidence: s.prefs.min_confidence,
      arbs: s.prefs.arbs,
      minArbProfit: s.prefs.min_arb_profit,
      telegram: s.prefs.channels?.telegram === true,
    },
    // Decimals arrive as strings.
    bankroll: finite(s.bankroll, 0),
    kellyFraction: finite(s.kelly_fraction, 0.25),
    currency: s.currency,
    telegramChatId: s.telegram_chat_id ?? null,
  };
}

const MOCK_SUBSCRIBERS: Subscriber[] = [
  {
    userId: "mock-user-1",
    displayName: "mock_eur_quarter",
    prefs: {
      enabled: true,
      minEv: 0.02,
      books: [],
      minConfidence: "low",
      arbs: true,
      minArbProfit: 0.005,
      telegram: true,
    },
    bankroll: 2500,
    kellyFraction: 0.25,
    currency: "EUR",
    telegramChatId: 111111111,
  },
  {
    userId: "mock-user-2",
    displayName: "mock_gbp_strict",
    prefs: {
      enabled: true,
      minEv: 0.04,
      books: ["ubuk", "ladbrokes", "coral", "smarkets", "betfair_ex"],
      minConfidence: "medium",
      arbs: false,
      minArbProfit: 0.01,
      telegram: true,
    },
    bankroll: 800,
    kellyFraction: 0.5,
    currency: "GBP",
    telegramChatId: 222222222,
  },
  {
    userId: "mock-user-3",
    displayName: "mock_discord_only",
    prefs: {
      enabled: true,
      minEv: 0.02,
      books: [],
      minConfidence: "low",
      arbs: false,
      minArbProfit: 0.01,
      telegram: false,
    },
    bankroll: 1000,
    kellyFraction: 0.25,
    currency: "USD",
    telegramChatId: 333333333,
  },
];

let mockLogged = false;
function mockSubscribers(reason: string): Subscriber[] {
  if (!mockLogged) {
    logger.info("Dry run uses mock alert subscribers", { reason });
    mockLogged = true;
  }
  return MOCK_SUBSCRIBERS;
}

export async function fetchSubscribers(): Promise<Subscriber[]> {
  if (DRY_RUN && !INTERNAL_TOKEN) return mockSubscribers("no INTERNAL_TOKEN");
  const res = await internal
    .GET("/v1/internal/alert-subscribers", {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    .catch((err: unknown) => {
      if (DRY_RUN) return null;
      throw err;
    });
  if (!res) return mockSubscribers("API unreachable");
  if (res.data) {
    if (DRY_RUN && res.data.length === 0)
      return mockSubscribers("no subscribers");
    return res.data.map(toSubscriber);
  }
  if (DRY_RUN) return mockSubscribers(`endpoint ${res.response.status}`);
  throw new Error(`alert-subscribers answered ${res.response.status}`);
}

export async function linkTelegram(
  token: string,
  chatId: number,
  username: string | null,
): Promise<LinkResult> {
  if (DRY_RUN) {
    return token === "invalid"
      ? { ok: false, reason: "invalid_token" }
      : { ok: true, userId: "mock-user-1", displayName: "mock_eur_quarter" };
  }
  try {
    const res = await internal.POST("/v1/internal/telegram/link", {
      body: { token, chat_id: chatId, username },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.data) {
      return {
        ok: true,
        userId: res.data.user_id,
        displayName: res.data.display_name,
      };
    }
    if (res.response.status === 404 && res.error?.code === "invalid_token") {
      return { ok: false, reason: "invalid_token" };
    }
    logger.warn("Telegram link answered unexpectedly", {
      status: res.response.status,
    });
  } catch (err) {
    logger.warn("Telegram link call failed", { error: String(err) });
  }
  return { ok: false, reason: "unavailable" };
}

const mockDeliveries = new Set<string>();

// Recorded before sending, so a restart or a second instance never sends one alert twice. Arbs use `arb:<id>`.
export async function recordDelivery(
  userId: string,
  ledgerId: string,
): Promise<DeliveryResult> {
  if (DRY_RUN) {
    const key = `${userId} ${ledgerId}`;
    if (mockDeliveries.has(key)) return "duplicate";
    mockDeliveries.add(key);
    return "created";
  }
  try {
    const res = await internal.POST("/v1/internal/alert-deliveries", {
      body: { user_id: userId, ledger_id: ledgerId, channel: "telegram" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.response.status === 409) return "duplicate";
    if (res.data) return res.data.created ? "created" : "duplicate";
    logger.warn("Recording delivery failed", {
      userId,
      ledgerId,
      status: res.response.status,
    });
  } catch (err) {
    logger.warn("Recording delivery failed", {
      userId,
      ledgerId,
      error: String(err),
    });
  }
  return "failed";
}

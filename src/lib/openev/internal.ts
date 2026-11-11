import { logger } from "@/lib/logger";
import { finite, isRecord, stringList } from "@/lib/state";
import { DRY_RUN, INTERNAL_TOKEN, OPENEV_API_URL } from "@/shared/config/env";
import {
  type AlertConfidence,
  isAlertConfidence,
} from "@/shared/config/openev";

// Not in the OpenAPI spec yet, so the internal contract is typed and checked by hand here.
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

function internalFetch(path: string, init: RequestInit = {}) {
  return fetch(`${OPENEV_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Token": INTERNAL_TOKEN,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function bodyOf(res: Response): Promise<unknown> {
  try {
    const parsed: unknown = await res.json();
    return parsed;
  } catch {
    return null;
  }
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function parsePrefs(value: unknown): AlertPrefs {
  const p = isRecord(value) ? value : {};
  const channels = isRecord(p.channels) ? p.channels : {};
  return {
    enabled: p.enabled === true,
    minEv: finite(p.min_ev, 0),
    books: stringList(p.books),
    minConfidence: isAlertConfidence(p.min_confidence)
      ? p.min_confidence
      : "low",
    arbs: p.arbs === true,
    minArbProfit: finite(p.min_arb_profit, 0.01),
    telegram: channels.telegram === true,
  };
}

function parseSubscriber(value: unknown): Subscriber | null {
  if (!isRecord(value)) return null;
  const userId = idOf(value.user_id);
  if (!userId) return null;
  const chat = finite(value.telegram_chat_id, Number.NaN);
  return {
    userId,
    displayName:
      typeof value.display_name === "string" ? value.display_name : userId,
    prefs: parsePrefs(value.prefs),
    bankroll: finite(value.bankroll, 0),
    kellyFraction: finite(value.kelly_fraction, 0.25),
    currency: typeof value.currency === "string" ? value.currency : "EUR",
    telegramChatId: Number.isSafeInteger(chat) ? chat : null,
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
  let res: Response;
  try {
    res = await internalFetch("/v1/internal/alert-subscribers");
  } catch (err) {
    if (DRY_RUN) return mockSubscribers(String(err));
    throw err;
  }
  if (DRY_RUN && res.status === 404) return mockSubscribers("endpoint 404");
  if (!res.ok) {
    throw new Error(`alert-subscribers answered ${res.status}`);
  }
  const body = await bodyOf(res);
  if (!Array.isArray(body)) throw new Error("alert-subscribers is no list");
  return body.map(parseSubscriber).filter((s): s is Subscriber => s !== null);
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
  let res: Response;
  try {
    res = await internalFetch("/v1/internal/telegram/link", {
      method: "POST",
      body: JSON.stringify({ token, chat_id: chatId, username }),
    });
  } catch (err) {
    logger.warn("Telegram link call failed", { error: String(err) });
    return { ok: false, reason: "unavailable" };
  }
  const body = await bodyOf(res);
  if (res.ok && isRecord(body)) {
    const userId = idOf(body.user_id);
    if (userId) {
      return {
        ok: true,
        userId,
        displayName:
          typeof body.display_name === "string" ? body.display_name : userId,
      };
    }
  }
  if (res.status === 404 && isRecord(body) && body.code === "invalid_token") {
    return { ok: false, reason: "invalid_token" };
  }
  logger.warn("Telegram link answered unexpectedly", { status: res.status });
  return { ok: false, reason: "unavailable" };
}

const mockDeliveries = new Set<string>();

// Recorded before sending, so a restart or a second instance never sends one alert twice.
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
    const res = await internalFetch("/v1/internal/alert-deliveries", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        ledger_id: ledgerId,
        channel: "telegram",
      }),
    });
    if (res.status === 409) return "duplicate";
    if (res.ok) return "created";
    logger.warn("Recording delivery failed", {
      userId,
      ledgerId,
      status: res.status,
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

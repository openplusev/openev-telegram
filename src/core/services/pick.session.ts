import type { ApiEvent, ApiMarketOdds, ApiOutcome } from "@/lib/api";
import type { Market, SportKey } from "@/shared/config/sports";

const TTL_MS = 15 * 60 * 1000;

export interface PickSession {
  messageId: number;
  expiresAt: number;
  busy: boolean;
  page: number;
  sport?: SportKey;
  events?: ApiEvent[];
  event?: ApiEvent;
  market?: Market;
  odds?: ApiMarketOdds;
  outcome?: ApiOutcome;
  units?: number;
}

const sessions = new Map<string, PickSession>();

// One flow per user per chat, so a group can run several flows side by side.
function key(chatId: number, userId: number): string {
  return `${chatId}:${userId}`;
}

export function startSession(
  chatId: number,
  userId: number,
  messageId: number,
): PickSession {
  const session: PickSession = {
    messageId,
    expiresAt: Date.now() + TTL_MS,
    busy: false,
    page: 0,
  };
  sessions.set(key(chatId, userId), session);
  return session;
}

export function getSession(
  chatId: number,
  userId: number,
  messageId: number,
): PickSession | null {
  const session = sessions.get(key(chatId, userId));
  if (!session || session.messageId !== messageId) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(key(chatId, userId));
    return null;
  }
  session.expiresAt = Date.now() + TTL_MS;
  return session;
}

export function endSession(chatId: number, userId: number): void {
  sessions.delete(key(chatId, userId));
}

setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (s.expiresAt < now) sessions.delete(k);
}, 60_000).unref();

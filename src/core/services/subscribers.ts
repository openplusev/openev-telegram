import { logger } from "@/lib/logger";
import { type Subscriber, fetchSubscribers } from "@/lib/openev/internal";
import { dataFile, finite, isRecord, readJson, writeJson } from "@/lib/state";

const REFRESH_MS = 60_000;
const FILE = dataFile("openev-personal.json");

let subscribers: Subscriber[] = [];
// Chats that sent /stop; the API keeps the prefs, this only pauses Telegram.
const muted = new Set<number>();
// User id to the chat that blocked the bot; a relink to any chat clears it.
const blocked = new Map<string, number>();

async function save(): Promise<void> {
  await writeJson(FILE, {
    muted: [...muted],
    blocked: Object.fromEntries(blocked),
  });
}

async function load(): Promise<void> {
  const parsed = await readJson(FILE);
  if (!isRecord(parsed)) return;
  if (Array.isArray(parsed.muted)) {
    for (const id of parsed.muted) {
      const n = finite(id, Number.NaN);
      if (Number.isSafeInteger(n)) muted.add(n);
    }
  }
  if (isRecord(parsed.blocked)) {
    for (const [userId, chat] of Object.entries(parsed.blocked)) {
      const n = finite(chat, Number.NaN);
      if (Number.isSafeInteger(n)) blocked.set(userId, n);
    }
  }
}

export async function refreshSubscribers(): Promise<void> {
  try {
    subscribers = await fetchSubscribers();
  } catch (err) {
    logger.warn("Refreshing alert subscribers failed, keeping the last list", {
      error: String(err),
    });
  }
}

export async function startSubscribers(): Promise<void> {
  await load();
  await refreshSubscribers();
  setInterval(() => void refreshSubscribers(), REFRESH_MS);
}

export function allSubscribers(): Subscriber[] {
  return subscribers;
}

export function subscriberForChat(chatId: number): Subscriber | undefined {
  return subscribers.find((s) => s.telegramChatId === chatId);
}

export function isMuted(chatId: number): boolean {
  return muted.has(chatId);
}

export async function setMuted(chatId: number, value: boolean): Promise<void> {
  if (value === muted.has(chatId)) return;
  if (value) muted.add(chatId);
  else muted.delete(chatId);
  await save();
}

export function isBlocked(s: Subscriber): boolean {
  return (
    s.telegramChatId !== null && blocked.get(s.userId) === s.telegramChatId
  );
}

export async function markBlocked(
  userId: string,
  chatId: number,
): Promise<void> {
  if (blocked.get(userId) === chatId) return;
  logger.info("User blocked the bot, skipping until relinked", {
    userId,
    chatId,
  });
  blocked.set(userId, chatId);
  await save();
}

export async function clearBlocked(userId: string): Promise<void> {
  if (!blocked.delete(userId)) return;
  await save();
}

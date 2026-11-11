import type { Arb, LedgerEntry } from "@/lib/openev/client";
import {
  dataFile,
  finite,
  isRecord,
  readJson,
  stringList,
  writeJson,
} from "@/lib/state";
import {
  type AlertConfidence,
  LEDGER_MIN_EV,
  isAlertConfidence,
  meetsConfidence,
} from "@/shared/config/openev";

const FILE = dataFile("openev-chats.json");

export interface ChatAlertSettings {
  enabled: boolean;
  // Fractions, like the API: 0.03 is +3%.
  minEv: number;
  // Empty means every book.
  books: string[];
  minConfidence: AlertConfidence;
  arbs: boolean;
  minArbProfit: number;
}

export const DEFAULT_SETTINGS: ChatAlertSettings = {
  enabled: false,
  minEv: LEDGER_MIN_EV,
  books: [],
  minConfidence: "low",
  arbs: false,
  minArbProfit: 0.01,
};

const settings = new Map<number, ChatAlertSettings>();

function parseSettings(value: unknown): ChatAlertSettings | null {
  if (!isRecord(value)) return null;
  return {
    enabled: value.enabled === true,
    minEv: finite(value.minEv, DEFAULT_SETTINGS.minEv),
    books: stringList(value.books),
    minConfidence: isAlertConfidence(value.minConfidence)
      ? value.minConfidence
      : DEFAULT_SETTINGS.minConfidence,
    arbs: value.arbs === true,
    minArbProfit: finite(value.minArbProfit, DEFAULT_SETTINGS.minArbProfit),
  };
}

export async function loadChatSettings(): Promise<void> {
  const parsed = await readJson(FILE);
  if (!isRecord(parsed)) return;
  for (const [chatId, value] of Object.entries(parsed)) {
    const id = Number(chatId);
    const s = parseSettings(value);
    if (s && Number.isSafeInteger(id)) settings.set(id, s);
  }
}

export function chatSettings(chatId: number): ChatAlertSettings {
  return settings.get(chatId) ?? DEFAULT_SETTINGS;
}

export function enabledChats(): [number, ChatAlertSettings][] {
  return [...settings.entries()].filter(([, s]) => s.enabled);
}

// Only used by DRY_RUN, which never writes state.
export function setChatSettingsInMemory(
  chatId: number,
  value: ChatAlertSettings,
): void {
  settings.set(chatId, value);
}

export async function updateChatSettings(
  chatId: number,
  patch: Partial<ChatAlertSettings>,
): Promise<ChatAlertSettings> {
  const next = { ...chatSettings(chatId), ...patch };
  settings.set(chatId, next);
  await writeJson(FILE, Object.fromEntries(settings));
  return next;
}

// A group upgraded to a supergroup gets a new id; its settings move with it.
export async function moveChat(from: number, to: number): Promise<void> {
  const s = settings.get(from);
  if (!s) return;
  settings.delete(from);
  settings.set(to, s);
  await writeJson(FILE, Object.fromEntries(settings));
}

export async function disableChat(chatId: number): Promise<void> {
  if (!settings.get(chatId)?.enabled) return;
  await updateChatSettings(chatId, { enabled: false });
}

export interface AlertFilter {
  minEv: number;
  books: string[];
  minConfidence: AlertConfidence;
}

export interface ArbFilter {
  arbs: boolean;
  minArbProfit: number;
  books: string[];
}

// Null when the entry passes, else the first reason it does not.
export function alertMismatch(f: AlertFilter, e: LedgerEntry): string | null {
  if (e.alert_ev < f.minEv) return "ev below minimum";
  if (f.books.length > 0 && !f.books.includes(e.book))
    return "book not selected";
  if (!meetsConfidence(e.confidence, f.minConfidence)) {
    return "confidence below minimum";
  }
  return null;
}

// Every leg has to be at one of the selected books or the arb cannot be placed.
export function arbMismatch(f: ArbFilter, arb: Arb): string | null {
  if (!f.arbs) return "arbs off";
  if (arb.check) return "flagged for review";
  if (arb.profit < f.minArbProfit) return "profit below minimum";
  if (f.books.length > 0 && !arb.legs.every((l) => f.books.includes(l.book))) {
    return "leg at a book not selected";
  }
  return null;
}

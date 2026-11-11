import {
  type OutgoingMessage,
  alertMessage,
} from "@/core/messages/alert.message";
import { arbMessage } from "@/core/messages/arb.message";
import {
  alertMismatch,
  arbMismatch,
  disableChat,
  enabledChats,
  moveChat,
} from "@/core/services/chat-settings";
import { enqueue } from "@/core/services/send.queue";
import {
  allSubscribers,
  isBlocked,
  isMuted,
  markBlocked,
} from "@/core/services/subscribers";
import { logger } from "@/lib/logger";
import {
  type Arb,
  type LedgerEntry,
  type ValueBet,
  fetchLedger,
  fetchValueBet,
} from "@/lib/openev/client";
import { connectEvents } from "@/lib/openev/events";
import { type Subscriber, recordDelivery } from "@/lib/openev/internal";
import {
  dataFile,
  isRecord,
  readJson,
  stringList,
  writeJson,
} from "@/lib/state";
import { DRY_RUN } from "@/shared/config/env";

const FILE = dataFile("openev-alerts.json");
// Mirrors the default row limit of GET /v1/ledger.
const LEDGER_PAGE = 500;
// After downtime only recent alerts are worth sending; older prices have most likely moved.
const CATCHUP_MAX_AGE_MS = 30 * 60 * 1000;
const SENT_TTL_MS = 48 * 60 * 60 * 1000;
// An arb that stays away this long is posted again when it returns.
const ARB_FORGET_MS = 6 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 5_000;

// The API stamps every alert of one snapshot with the same time, so the watermark keeps the ids at `since`.
interface Watermark {
  since: string;
  seen: string[];
}

interface FeedState {
  // Null until the first catch up, which marks the current ledger as seen instead of sending it.
  ledger: Watermark | null;
  // Chat id to ledger id to when it was sent there.
  sent: Record<string, Record<string, string>>;
  // Null until the first arb list, which is marked as seen.
  arbs: Record<string, string> | null;
}

type Decision = {
  target: "chat" | "personal";
  chat_id: number | null;
  user_id?: string;
  send: boolean;
  reason: string;
};

let state: FeedState = { ledger: null, sent: {}, arbs: null };
let chain: Promise<void> = Promise.resolve();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function parseState(value: unknown): FeedState {
  if (!isRecord(value)) return { ledger: null, sent: {}, arbs: null };
  const ledger = isRecord(value.ledger) ? value.ledger : null;
  const since =
    ledger && typeof ledger.since === "string" ? ledger.since : null;
  const sent: FeedState["sent"] = {};
  if (isRecord(value.sent)) {
    for (const [chatId, ids] of Object.entries(value.sent)) {
      if (!isRecord(ids)) continue;
      sent[chatId] = {};
      for (const [id, at] of Object.entries(ids)) {
        if (typeof at === "string") sent[chatId][id] = at;
      }
    }
  }
  let arbs: FeedState["arbs"] = null;
  if (isRecord(value.arbs)) {
    arbs = {};
    for (const [id, at] of Object.entries(value.arbs)) {
      if (typeof at === "string") arbs[id] = at;
    }
  }
  return {
    ledger:
      since && !Number.isNaN(Date.parse(since))
        ? { since, seen: stringList(ledger?.seen) }
        : null,
    sent,
    arbs,
  };
}

function prune(): void {
  const now = Date.now();
  for (const [chatId, ids] of Object.entries(state.sent)) {
    for (const [id, at] of Object.entries(ids)) {
      if (now - Date.parse(at) > SENT_TTL_MS) delete ids[id];
    }
    if (Object.keys(ids).length === 0) delete state.sent[chatId];
  }
}

function persistSoon(): void {
  if (DRY_RUN || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    prune();
    void writeJson(FILE, state);
  }, SAVE_DELAY_MS);
}

function serial(task: () => Promise<void>): void {
  chain = chain
    .then(task)
    .catch((err) =>
      logger.error("Alerts feed task failed", { error: String(err) }),
    );
}

function wasSent(chatId: number, ledgerId: string): boolean {
  return state.sent[String(chatId)]?.[ledgerId] !== undefined;
}

function markSent(chatId: number, ledgerId: string): void {
  const key = String(chatId);
  state.sent[key] ??= {};
  state.sent[key][ledgerId] = new Date().toISOString();
}

function advanceWatermark(entry: LedgerEntry): void {
  const at = Date.parse(entry.alerted_at);
  const mark = state.ledger;
  if (!mark || at > Date.parse(mark.since)) {
    state.ledger = { since: entry.alerted_at, seen: [entry.id] };
  } else if (at === Date.parse(mark.since) && !mark.seen.includes(entry.id)) {
    mark.seen.push(entry.id);
  }
}

function isFresh(entry: LedgerEntry, mark: Watermark): boolean {
  const at = Date.parse(entry.alerted_at);
  const since = Date.parse(mark.since);
  return at > since || (at === since && !mark.seen.includes(entry.id));
}

// Undefined when the API could not be asked; the message then leaves the live price out.
async function liveBet(id: string): Promise<ValueBet | null | undefined> {
  try {
    return await fetchValueBet(id);
  } catch (err) {
    logger.warn("Value bet lookup failed", { id, error: String(err) });
    return undefined;
  }
}

function chatHooks(chatId: number) {
  return {
    onGone: async () => {
      logger.info("Bot removed from chat, alerts off there", { chatId });
      await disableChat(chatId);
    },
    onMigrate: (to: number) => moveChat(chatId, to),
  };
}

function personalHooks(s: Subscriber, chatId: number) {
  return { onGone: () => markBlocked(s.userId, chatId) };
}

// Null when the subscriber can get Telegram alerts at all, else why not.
function personalBlocker(s: Subscriber): string | null {
  if (!s.prefs.telegram) return "telegram channel off";
  if (s.telegramChatId === null) return "no linked telegram chat";
  if (!s.prefs.enabled) return "alerts disabled";
  if (isMuted(s.telegramChatId)) return "paused with /stop";
  if (isBlocked(s)) return "bot blocked by user";
  return null;
}

function stakingOf(s: Subscriber) {
  return {
    bankroll: s.bankroll,
    kellyFraction: s.kellyFraction,
    currency: s.currency,
  };
}

async function handleEntry(entry: LedgerEntry, source: string): Promise<void> {
  advanceWatermark(entry);
  persistSoon();
  if (entry.status !== "open" || Date.parse(entry.starts_at) <= Date.now()) {
    return;
  }

  const decisions: Decision[] = [];
  let live: ValueBet | null | undefined;
  let liveLoaded = false;
  const render = async (
    staking: Subscriber | null,
  ): Promise<OutgoingMessage> => {
    if (!liveLoaded) {
      live = await liveBet(entry.id);
      liveLoaded = true;
    }
    return alertMessage(entry, live, staking ? stakingOf(staking) : null);
  };

  // Personal first, so a linked chat that also enabled group alerts gets the sized one.
  for (const s of allSubscribers()) {
    const chatId = s.telegramChatId;
    const blocker = personalBlocker(s) ?? alertMismatch(s.prefs, entry);
    if (blocker || chatId === null) {
      decisions.push({
        target: "personal",
        chat_id: chatId,
        user_id: s.userId,
        send: false,
        reason: blocker ?? "no chat",
      });
      continue;
    }
    if (wasSent(chatId, entry.id)) {
      decisions.push({
        target: "personal",
        chat_id: chatId,
        user_id: s.userId,
        send: false,
        reason: "already sent to this chat",
      });
      continue;
    }
    const recorded = await recordDelivery(s.userId, entry.id);
    if (recorded !== "created") {
      decisions.push({
        target: "personal",
        chat_id: chatId,
        user_id: s.userId,
        send: false,
        reason:
          recorded === "duplicate"
            ? "delivery already recorded"
            : "delivery record failed",
      });
      continue;
    }
    markSent(chatId, entry.id);
    decisions.push({
      target: "personal",
      chat_id: chatId,
      user_id: s.userId,
      send: true,
      reason: "matches prefs",
    });
    enqueue(chatId, await render(s), personalHooks(s, chatId));
  }

  for (const [chatId, settings] of enabledChats()) {
    if (wasSent(chatId, entry.id)) {
      decisions.push({
        target: "chat",
        chat_id: chatId,
        send: false,
        reason: "already sent to this chat",
      });
      continue;
    }
    const mismatch = alertMismatch(settings, entry);
    if (mismatch) {
      decisions.push({
        target: "chat",
        chat_id: chatId,
        send: false,
        reason: mismatch,
      });
      continue;
    }
    markSent(chatId, entry.id);
    decisions.push({
      target: "chat",
      chat_id: chatId,
      send: true,
      reason: "matches chat filters",
    });
    enqueue(chatId, await render(null), chatHooks(chatId));
  }

  const sent = decisions.filter((d) => d.send).length;
  if (DRY_RUN) {
    console.log(
      JSON.stringify(
        {
          dryRun: "fan out",
          source,
          ledger_id: entry.id,
          ev: entry.alert_ev,
          book: entry.book,
          confidence: entry.confidence,
          decisions,
        },
        null,
        2,
      ),
    );
  } else if (sent > 0) {
    logger.info("Alert fanned out", { ledgerId: entry.id, source, sent });
  }
}

async function catchUp(): Promise<void> {
  const entries = await fetchLedger(LEDGER_PAGE);
  if (!state.ledger) {
    for (const e of entries) advanceWatermark(e);
    state.ledger ??= { since: new Date().toISOString(), seen: [] };
    persistSoon();
    logger.info("Alerts start after the current ledger", {
      since: state.ledger.since,
    });
    return;
  }
  const mark = state.ledger;
  const fresh = entries
    .filter((e) => isFresh(e, mark))
    .sort(
      (a, b) =>
        Date.parse(a.alerted_at) - Date.parse(b.alerted_at) ||
        a.id.localeCompare(b.id),
    );
  const cutoff = Date.now() - CATCHUP_MAX_AGE_MS;
  let skipped = 0;
  for (const entry of fresh) {
    if (Date.parse(entry.alerted_at) < cutoff) {
      advanceWatermark(entry);
      skipped++;
      continue;
    }
    await handleEntry(entry, "catch up");
  }
  persistSoon();
  if (fresh.length) {
    logger.info("Caught up on missed alerts", { fresh: fresh.length, skipped });
  }
}

async function handleArbs(arbs: Arb[], snapshot: boolean): Promise<void> {
  const now = Date.now();
  const known = state.arbs;
  const next: Record<string, string> = {};
  if (known) {
    for (const [id, at] of Object.entries(known)) {
      if (now - Date.parse(at) < ARB_FORGET_MS) next[id] = at;
    }
  }
  const stamp = new Date(now).toISOString();
  const fresh: Arb[] = [];
  for (const arb of arbs) {
    if (known !== null && !(arb.id in next)) fresh.push(arb);
    next[arb.id] = stamp;
  }
  state.arbs = next;
  persistSoon();
  if (snapshot && fresh.length) {
    logger.info("Arbs found on reconnect", { fresh: fresh.length });
  }

  for (const arb of fresh) {
    const decisions: Decision[] = [];
    const message = arbMessage(arb);
    for (const s of allSubscribers()) {
      const blocker = personalBlocker(s) ?? arbMismatch(s.prefs, arb);
      if (blocker || s.telegramChatId === null) {
        decisions.push({
          target: "personal",
          chat_id: s.telegramChatId,
          user_id: s.userId,
          send: false,
          reason: blocker ?? "no chat",
        });
        continue;
      }
      const recorded = await recordDelivery(s.userId, `arb:${arb.id}`);
      decisions.push({
        target: "personal",
        chat_id: s.telegramChatId,
        user_id: s.userId,
        send: recorded === "created",
        reason:
          recorded === "created"
            ? "matches prefs"
            : recorded === "duplicate"
              ? "delivery already recorded"
              : "delivery record failed",
      });
      if (recorded !== "created") continue;
      enqueue(s.telegramChatId, message, personalHooks(s, s.telegramChatId));
    }
    for (const [chatId, settings] of enabledChats()) {
      const mismatch = arbMismatch(settings, arb);
      decisions.push({
        target: "chat",
        chat_id: chatId,
        send: !mismatch,
        reason: mismatch ?? "matches chat filters",
      });
      if (!mismatch) enqueue(chatId, message, chatHooks(chatId));
    }
    if (DRY_RUN) {
      console.log(
        JSON.stringify(
          {
            dryRun: "arb fan out",
            arb_id: arb.id,
            profit: arb.profit,
            decisions,
          },
          null,
          2,
        ),
      );
    }
  }
}

export async function startAlertsFeed(): Promise<void> {
  state = DRY_RUN ? state : parseState(await readJson(FILE));
  connectEvents({
    onConnect: () =>
      serial(() =>
        catchUp().catch((err) =>
          logger.warn("Catching up from the ledger failed", {
            error: String(err),
          }),
        ),
      ),
    onLedgerAdded: (entry) => serial(() => handleEntry(entry, "live")),
    onArbs: (arbs, snapshot) => serial(() => handleArbs(arbs, snapshot)),
  });
}

// DRY_RUN: replays the newest open alerts through the whole fan out, then follows live events.
export async function replayForDryRun(count: number): Promise<void> {
  const entries = await fetchLedger(LEDGER_PAGE);
  const open = entries
    .filter((e) => e.status === "open" && Date.parse(e.starts_at) > Date.now())
    .slice(0, count)
    .reverse();
  for (const entry of open) await handleEntry(entry, "dry run replay");
  for (const e of entries) advanceWatermark(e);
}

import type { OutgoingMessage } from "@/core/messages/alert.message";
import { logger } from "@/lib/logger";
import { GrammyError } from "grammy";

// Telegram allows about 30 messages a second overall, 1 a second per chat and 20 a minute per group.
const GLOBAL_PER_SECOND = 25;
const PRIVATE_GAP_MS = 1_000;
const GROUP_GAP_MS = 3_100;
const MAX_RETRIES = 5;
const MAX_QUEUED_PER_CHAT = 200;

export type Deliver = (
  chatId: number,
  message: OutgoingMessage,
) => Promise<void>;

interface Job {
  message: OutgoingMessage;
  retries: number;
  // The bot was blocked or removed from the chat.
  onGone?: () => void | Promise<void>;
  onMigrate?: (to: number) => void | Promise<void>;
}

interface ChatQueue {
  jobs: Job[];
  nextAt: number;
}

const chats = new Map<number, ChatQueue>();
const recent: number[] = [];
let deliver: Deliver | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pumping = false;

// Group and channel ids are negative.
function gapFor(chatId: number): number {
  return chatId < 0 ? GROUP_GAP_MS : PRIVATE_GAP_MS;
}

function isGone(err: GrammyError): boolean {
  return (
    err.error_code === 403 ||
    (err.error_code === 400 &&
      /chat not found|kicked|not a member|have no rights/i.test(
        err.description,
      ))
  );
}

function schedule(delay: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(
    () => {
      timer = null;
      void pump();
    },
    Math.max(0, delay),
  );
}

export function startQueue(fn: Deliver): void {
  deliver = fn;
  schedule(0);
}

export function enqueue(
  chatId: number,
  message: OutgoingMessage,
  hooks: Pick<Job, "onGone" | "onMigrate"> = {},
): void {
  const queue = chats.get(chatId) ?? { jobs: [], nextAt: 0 };
  if (queue.jobs.length >= MAX_QUEUED_PER_CHAT) {
    logger.warn("Send queue full for chat, dropping message", { chatId });
    return;
  }
  queue.jobs.push({ message, retries: 0, ...hooks });
  chats.set(chatId, queue);
  if (!pumping) schedule(0);
}

async function send(chatId: number, queue: ChatQueue, job: Job): Promise<void> {
  if (!deliver) return;
  try {
    await deliver(chatId, job.message);
  } catch (err) {
    if (!(err instanceof GrammyError)) {
      logger.warn("Sending failed", { chatId, error: String(err) });
      return;
    }
    const retryAfter = err.parameters.retry_after;
    if (err.error_code === 429 && retryAfter && job.retries < MAX_RETRIES) {
      queue.nextAt = Date.now() + retryAfter * 1000;
      queue.jobs.unshift({ ...job, retries: job.retries + 1 });
      logger.warn("Flood limit, retrying", { chatId, retryAfter });
      return;
    }
    const to = err.parameters.migrate_to_chat_id;
    if (to) {
      logger.info("Group became a supergroup, following it", { chatId, to });
      await job.onMigrate?.(to);
      enqueue(to, job.message, {
        onGone: job.onGone,
        onMigrate: job.onMigrate,
      });
      return;
    }
    if (isGone(err)) {
      queue.jobs.length = 0;
      await job.onGone?.();
      return;
    }
    logger.warn("Sending failed", { chatId, error: err.description });
  }
}

async function pump(): Promise<void> {
  if (pumping || !deliver) return;
  pumping = true;
  try {
    for (;;) {
      const now = Date.now();
      while (recent.length && now - (recent[0] ?? 0) >= 1000) recent.shift();
      if (recent.length >= GLOBAL_PER_SECOND) {
        schedule(1000 - (now - (recent[0] ?? now)));
        return;
      }
      let ready: [number, ChatQueue] | null = null;
      let wait = Number.POSITIVE_INFINITY;
      for (const entry of chats) {
        const queue = entry[1];
        if (queue.jobs.length === 0) {
          if (queue.nextAt <= now) chats.delete(entry[0]);
          continue;
        }
        if (queue.nextAt <= now) {
          if (!ready || queue.nextAt < ready[1].nextAt) ready = entry;
        } else {
          wait = Math.min(wait, queue.nextAt - now);
        }
      }
      if (!ready) {
        if (Number.isFinite(wait)) schedule(wait);
        return;
      }
      const chatId = ready[0];
      const queue = ready[1];
      const job = queue.jobs.shift();
      if (!job) continue;
      recent.push(now);
      queue.nextAt = now + gapFor(chatId);
      await send(chatId, queue, job);
    }
  } finally {
    pumping = false;
  }
}

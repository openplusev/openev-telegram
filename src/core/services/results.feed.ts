import { resultMessage } from "@/core/messages/result.message";
import { ApiError, api, type ApiSettledPick } from "@/lib/api";
import { logger } from "@/lib/logger";
import { type Api, GrammyError } from "grammy";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const INTERVAL_MS = 5 * 60 * 1000;
const MAX_PER_TICK = 20;
const DATA_DIR = process.env.DATA_DIR?.trim() || "/app/data";
const STATE_FILE = join(DATA_DIR, "results-watermarks.json");

// chatId to ISO watermark; a chat is tracked once a pick was made in it.
const watermarks = new Map<string, string>();
let running = false;
let missingEndpointLogged = false;

export function guildIdFor(chatId: number | string): string {
  return `tg:${chatId}`;
}

async function loadWatermarks(): Promise<void> {
  try {
    const parsed: unknown = JSON.parse(await readFile(STATE_FILE, "utf-8"));
    if (typeof parsed !== "object" || parsed === null) return;
    for (const [chatId, since] of Object.entries(parsed)) {
      if (typeof since === "string" && !Number.isNaN(Date.parse(since))) {
        watermarks.set(chatId, since);
      }
    }
    logger.info("Results watermarks loaded", { chats: watermarks.size });
  } catch (err) {
    logger.info("No results watermarks on disk", { error: String(err) });
  }
}

// Write then rename so a crash mid write never leaves a truncated file.
async function saveWatermarks(): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(Object.fromEntries(watermarks)));
    await rename(tmp, STATE_FILE);
  } catch (err) {
    logger.warn("Saving results watermarks failed", { error: String(err) });
  }
}

export async function trackChat(chatId: number): Promise<void> {
  const key = String(chatId);
  if (watermarks.has(key)) return;
  // The first pick starts the feed, so older results of the chat never flood in.
  watermarks.set(key, new Date().toISOString());
  await saveWatermarks();
}

function isGone(err: unknown): boolean {
  return (
    err instanceof GrammyError &&
    (err.error_code === 403 ||
      (err.error_code === 400 && /chat not found/i.test(err.description)))
  );
}

// Returns false when the endpoint is not deployed, so the tick stops early.
async function pollChat(botApi: Api, chatId: string): Promise<boolean> {
  const since = watermarks.get(chatId);
  if (!since) return true;

  let picks: ApiSettledPick[];
  try {
    picks = await api.settledPicks(guildIdFor(chatId), new Date(since));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      if (!missingEndpointLogged) {
        logger.info("Settled picks endpoint not available yet");
        missingEndpointLogged = true;
      }
      return false;
    }
    logger.warn("Settled picks fetch failed", { chatId, error: String(err) });
    return true;
  }
  missingEndpointLogged = false;

  const sinceMs = Date.parse(since);
  const fresh = picks
    .filter((p) => p.result !== "pending" && Date.parse(p.settledAt) > sinceMs)
    .sort((a, b) => Date.parse(a.settledAt) - Date.parse(b.settledAt))
    .slice(0, MAX_PER_TICK);

  for (const pick of fresh) {
    try {
      await botApi.sendMessage(chatId, resultMessage(pick), {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      if (isGone(err)) {
        logger.info("Bot removed from chat, dropping it", { chatId });
        watermarks.delete(chatId);
        break;
      }
      // Flood limit: keep the watermark so the next tick retries.
      if (err instanceof GrammyError && err.error_code === 429) break;
      logger.warn("Posting result failed", {
        chatId,
        pickId: pick.id,
        error: String(err),
      });
    }
    watermarks.set(chatId, pick.settledAt);
  }
  if (fresh.length) await saveWatermarks();
  return true;
}

async function tick(botApi: Api): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const chatId of [...watermarks.keys()]) {
      if (!(await pollChat(botApi, chatId))) break;
    }
  } catch (err) {
    logger.error("Results feed tick failed", { error: String(err) });
  } finally {
    running = false;
  }
}

export async function startResultsFeed(botApi: Api): Promise<void> {
  await loadWatermarks();
  void tick(botApi);
  setInterval(() => void tick(botApi), INTERVAL_MS);
}

import { logger } from "@/lib/logger";
import type { Arb, LedgerEntry, ServerMessage } from "@/lib/openev/client";
import { OPENEV_API_URL } from "@/shared/config/env";

const PING_MS = 20_000;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

export interface EventHandlers {
  // Runs after every (re)connect, so missed alerts can be caught up.
  onConnect: () => void;
  onLedgerAdded: (entry: LedgerEntry) => void;
  onArbs: (arbs: Arb[], snapshot: boolean) => void;
}

export const EVENTS_URL = `${OPENEV_API_URL.replace(/^http/, "ws")}/v1/ws`;

function parse(data: unknown): ServerMessage | null {
  if (typeof data !== "string") return null;
  try {
    // JSON boundary: frames are ServerMessage per the API's OpenAPI spec.
    const msg: ServerMessage = JSON.parse(data);
    return typeof msg === "object" && msg !== null && "type" in msg
      ? msg
      : null;
  } catch {
    return null;
  }
}

export function connectEvents(handlers: EventHandlers): void {
  let backoff = MIN_BACKOFF_MS;

  const open = () => {
    const ws = new WebSocket(EVENTS_URL);
    let ping: ReturnType<typeof setInterval> | null = null;

    ws.addEventListener("open", () => {
      backoff = MIN_BACKOFF_MS;
      logger.info("Live events connected", { url: EVENTS_URL });
      ws.send(JSON.stringify({ type: "subscribe", topic: "ledger" }));
      ws.send(
        JSON.stringify({ type: "subscribe", topic: "arbs", min_profit: 0 }),
      );
      // The server closes a connection that sends nothing for 60 s.
      ping = setInterval(
        () => ws.send(JSON.stringify({ type: "ping" })),
        PING_MS,
      );
      handlers.onConnect();
    });

    ws.addEventListener("message", (event) => {
      const msg = parse(event.data);
      if (!msg) return;
      switch (msg.type) {
        case "ledger_added":
          handlers.onLedgerAdded(msg.entry);
          break;
        case "arbs_snapshot":
          handlers.onArbs(msg.arbs, true);
          break;
        case "arb_added":
          handlers.onArbs([msg.arb], false);
          break;
        case "error":
          logger.warn("Live events error", {
            code: msg.code,
            message: msg.message,
          });
          break;
      }
    });

    ws.addEventListener("close", (event) => {
      if (ping) clearInterval(ping);
      logger.warn("Live events closed, reconnecting", {
        code: event.code,
        reason: event.reason,
        inMs: backoff,
      });
      setTimeout(open, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    });

    ws.addEventListener("error", () => {
      logger.debug("Live events socket error");
    });
  };

  open();
}

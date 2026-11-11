import {
  ALERTS_USAGE,
  chatSettingsMessage,
} from "@/core/messages/settings.message";
import {
  type ChatAlertSettings,
  chatSettings,
  updateChatSettings,
} from "@/core/services/chat-settings";
import { esc } from "@/core/utils/html.utils";
import { replyHtml } from "@/core/utils/reply.utils";
import { logger } from "@/lib/logger";
import { fetchBookCodes } from "@/lib/openev/client";
import {
  ALERT_CONFIDENCES,
  LEDGER_MIN_EV,
  isAlertConfidence,
} from "@/shared/config/openev";
import { type Context, Composer } from "grammy";

const MAX_ARB_PROFIT = 0.2;

export const alertsCommand = new Composer();

// Channel posts come only from its admins; anonymous group admins post as the group itself.
async function canManage(ctx: Context): Promise<boolean> {
  const chat = ctx.chat;
  if (!chat) return false;
  if (chat.type === "private" || chat.type === "channel") return true;
  if (ctx.senderChat?.id === chat.id) return true;
  if (!ctx.from) return false;
  const member = await ctx.getChatMember(ctx.from.id);
  return member.status === "creator" || member.status === "administrator";
}

// Accepts "3", "3%" and "3.5"; returns a fraction.
function parsePercent(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(/%$/, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n / 100 : null;
}

type Change =
  { patch: Partial<ChatAlertSettings>; note?: string } | { error: string };

async function parseBooks(args: string[]): Promise<Change> {
  const codes = args
    .flatMap((a) => a.split(","))
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (codes.length === 0) return { error: "Name at least one book, or all." };
  if (codes.includes("all")) return { patch: { books: [] } };
  let known: string[] | null = null;
  try {
    known = await fetchBookCodes();
  } catch (err) {
    logger.warn("Book list unavailable, taking books as given", {
      error: String(err),
    });
  }
  const unknown = known ? codes.filter((c) => !known.includes(c)) : [];
  if (unknown.length > 0) {
    return {
      error: `Unknown book codes: ${unknown.join(", ")}. Known codes: ${(known ?? []).join(", ")}`,
    };
  }
  return { patch: { books: [...new Set(codes)] } };
}

async function parseChange(
  action: string,
  args: string[],
): Promise<Change | null> {
  switch (action) {
    case "on":
      return { patch: { enabled: true } };
    case "off":
      return { patch: { enabled: false } };
    case "ev": {
      const ev = parsePercent(args[0]);
      if (ev === null)
        return {
          error: "Give the minimum EV in percent, for example /alerts ev 3.",
        };
      return ev < LEDGER_MIN_EV
        ? {
            patch: { minEv: LEDGER_MIN_EV },
            note: "The ledger starts at +2.0% EV, so the minimum is 2.",
          }
        : { patch: { minEv: ev } };
    }
    case "confidence": {
      const value = args[0]?.toLowerCase();
      if (!isAlertConfidence(value)) {
        return {
          error: `Confidence is one of ${ALERT_CONFIDENCES.join(", ")}.`,
        };
      }
      return { patch: { minConfidence: value } };
    }
    case "books":
      return parseBooks(args);
    case "arbs": {
      const mode = args[0]?.toLowerCase();
      if (mode === "off") return { patch: { arbs: false } };
      const raw = mode === "on" ? args[1] : mode;
      if (raw === undefined) return { patch: { arbs: true } };
      const profit = parsePercent(raw);
      if (profit === null || profit > MAX_ARB_PROFIT) {
        return {
          error:
            "Give the minimum arb profit in percent, for example /alerts arbs on 1.5.",
        };
      }
      return { patch: { arbs: true, minArbProfit: profit } };
    }
    default:
      return null;
  }
}

alertsCommand.command("alerts", async (ctx) => {
  const args = ctx.match.trim().split(/\s+/).filter(Boolean);
  const action = args[0]?.toLowerCase() ?? "status";
  const chatId = ctx.chat.id;

  if (action === "status" || action === "settings") {
    const body = chatSettingsMessage(chatSettings(chatId));
    await replyHtml(
      ctx,
      action === "settings" ? `${body}\n\n${ALERTS_USAGE}` : body,
    );
    return;
  }

  if (!(await canManage(ctx))) {
    await replyHtml(ctx, "Only admins of this chat can change its alerts.");
    return;
  }

  const change = await parseChange(action, args.slice(1));
  if (!change) {
    await replyHtml(ctx, `Unknown option ${esc(action)}.\n\n${ALERTS_USAGE}`);
    return;
  }
  if ("error" in change) {
    await replyHtml(ctx, esc(change.error));
    return;
  }

  const next = await updateChatSettings(chatId, change.patch);
  logger.info("Chat alert settings changed", { chatId, patch: change.patch });
  const note = change.note ? `${esc(change.note)}\n\n` : "";
  await replyHtml(ctx, `${note}${chatSettingsMessage(next)}`);
});

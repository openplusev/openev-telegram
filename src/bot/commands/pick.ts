import { pickMessage } from "@/core/messages/pick.message";
import {
  type PickSession,
  endSession,
  getSession,
  startSession,
} from "@/core/services/pick.session";
import { guildIdFor, trackChat } from "@/core/services/results.feed";
import { formatOdds, formatUtc } from "@/core/utils/format.utils";
import { esc } from "@/core/utils/html.utils";
import { isUpcoming, matchupTitle } from "@/core/utils/pick.utils";
import { editHtml, replyHtml } from "@/core/utils/reply.utils";
import { ApiError, api, type ApiEvent } from "@/lib/api";
import { logger } from "@/lib/logger";
import {
  MARKETS,
  SPORTS,
  type SportKey,
  marketLabel,
  sportLabel,
} from "@/shared/config/sports";
import { Composer, type Context, InlineKeyboard } from "grammy";

const EVENTS_PER_PAGE = 8;
const UNITS = [0.5, 1, 2, 3, 5] as const;
const EVENTS_TTL_MS = 60_000;
const NO_USERNAME =
  "Set a Telegram username first (Settings, Username). Your public record is keyed by it.";

const eventsCache = new Map<SportKey, { at: number; events: ApiEvent[] }>();

// A group can open many flows at once, so one fetch per sport serves them all.
async function upcomingEvents(sport: SportKey): Promise<ApiEvent[]> {
  let hit = eventsCache.get(sport);
  if (!hit || Date.now() - hit.at >= EVENTS_TTL_MS) {
    hit = { at: Date.now(), events: await api.events(sport) };
    eventsCache.set(sport, hit);
  }
  return hit.events
    .filter((e) => isUpcoming(e))
    .sort(
      (a, b) =>
        new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime(),
    );
}

function eventButton(e: ApiEvent): string {
  return `${e.away} @ ${e.home}, ${formatUtc(e.commenceTime)}`.slice(0, 64);
}

function footer(kb: InlineKeyboard, back?: number): InlineKeyboard {
  kb.row();
  if (back !== undefined) kb.text("Back", `pk:b:${back}`);
  return kb.text("Cancel", "pk:x");
}

type PickDraft = Partial<
  Pick<PickSession, "sport" | "event" | "market" | "odds" | "outcome" | "units">
>;

function summary(s: PickDraft): string[] {
  const lines = ["<b>New pick</b>"];
  if (s.sport) lines.push(esc(sportLabel(s.sport)));
  if (s.event) {
    lines.push(esc(matchupTitle(s.event)));
    lines.push(`Starts ${esc(formatUtc(s.event.commenceTime))}`);
  }
  if (s.market) lines.push(`Market ${esc(marketLabel(s.market))}`);
  if (s.outcome && s.odds) {
    lines.push(
      `Selection <b>${esc(s.outcome.selection)}</b>, now ${esc(formatOdds(s.outcome.odds))} at ${esc(s.odds.bookmaker)}`,
    );
  }
  if (s.units !== undefined) lines.push(`Units ${esc(s.units)}u`);
  return lines;
}

function sportScreen(s: PickDraft, note?: string) {
  const kb = new InlineKeyboard();
  SPORTS.forEach((sport, i) => {
    kb.text(sport.name, `pk:s:${i}`);
    if (i % 2 === 1) kb.row();
  });
  const text = [...summary(s), note ? esc(note) : "", "Choose a sport."]
    .filter(Boolean)
    .join("\n");
  return { text, kb: footer(kb) };
}

function eventScreen(s: PickSession) {
  const events = s.events ?? [];
  const pages = Math.max(1, Math.ceil(events.length / EVENTS_PER_PAGE));
  const page = Math.min(Math.max(s.page, 0), pages - 1);
  s.page = page;
  const kb = new InlineKeyboard();
  events
    .slice(page * EVENTS_PER_PAGE, (page + 1) * EVENTS_PER_PAGE)
    .forEach((e, i) =>
      kb.text(eventButton(e), `pk:e:${page * EVENTS_PER_PAGE + i}`).row(),
    );
  if (page > 0) kb.text("Prev", `pk:p:${page - 1}`);
  if (page < pages - 1) kb.text("Next", `pk:p:${page + 1}`);
  const text = [
    ...summary(s),
    `Choose an event. Page ${page + 1} of ${pages}, times in UTC.`,
  ].join("\n");
  return { text, kb: footer(kb, 0) };
}

function marketScreen(s: PickSession, note?: string) {
  const kb = new InlineKeyboard();
  MARKETS.forEach((m, i) => kb.text(m.name, `pk:m:${i}`));
  const text = [...summary(s), note ? esc(note) : "", "Choose a market."]
    .filter(Boolean)
    .join("\n");
  return { text, kb: footer(kb, 1) };
}

function selectionScreen(s: PickSession) {
  const kb = new InlineKeyboard();
  s.odds?.outcomes.forEach((o, i) =>
    kb.text(`${o.selection} ${formatOdds(o.odds)}`, `pk:o:${i}`).row(),
  );
  const text = [
    ...summary(s),
    `Current lines at ${esc(s.odds?.bookmaker ?? "")}. Choose a selection.`,
  ].join("\n");
  return { text, kb: footer(kb, 2) };
}

function unitsScreen(s: PickSession) {
  const kb = new InlineKeyboard();
  UNITS.forEach((u, i) => kb.text(`${u}u`, `pk:u:${i}`));
  return {
    text: [...summary(s), "Choose your stake in units."].join("\n"),
    kb: footer(kb, 3),
  };
}

function confirmScreen(s: PickSession) {
  const kb = new InlineKeyboard().text("Lock pick", "pk:ok");
  const text = [
    ...summary(s),
    "",
    "The odds are captured by OpenCapper the moment you confirm, at the market price then, which can differ from the line shown. Once locked the pick cannot be edited or deleted.",
  ].join("\n");
  return { text, kb: footer(kb, 4) };
}

async function showEvents(ctx: Context, s: PickSession, sport: SportKey) {
  s.sport = sport;
  s.event = s.market = s.odds = s.outcome = s.units = undefined;
  s.events = await upcomingEvents(sport);
  s.page = 0;
  if (!s.events.length) {
    s.sport = undefined;
    const screen = sportScreen(
      s,
      `No upcoming ${sportLabel(sport)} events right now.`,
    );
    return editHtml(ctx, screen.text, screen.kb);
  }
  const screen = eventScreen(s);
  return editHtml(ctx, screen.text, screen.kb);
}

async function showSelections(ctx: Context, s: PickSession) {
  const sport = s.sport;
  const event = s.event;
  const market = s.market;
  if (!sport || !event || !market) return;
  s.outcome = s.units = undefined;
  const odds = await api.odds(sport, event.id);
  s.odds = odds.markets.find(
    (m) => m.market === market && m.outcomes.length > 0,
  );
  if (!s.odds) {
    s.market = undefined;
    const screen = marketScreen(
      s,
      `No live ${marketLabel(market)} odds for this event right now.`,
    );
    return editHtml(ctx, screen.text, screen.kb);
  }
  const screen = selectionScreen(s);
  return editHtml(ctx, screen.text, screen.kb);
}

async function goBack(ctx: Context, s: PickSession, step: number) {
  if (step <= 0) {
    s.sport = s.events = s.event = s.market = undefined;
    s.odds = s.outcome = s.units = undefined;
    const screen = sportScreen(s);
    return editHtml(ctx, screen.text, screen.kb);
  }
  if (step === 1) {
    s.event = s.market = s.odds = s.outcome = s.units = undefined;
    const screen = eventScreen(s);
    return editHtml(ctx, screen.text, screen.kb);
  }
  if (step === 2) {
    s.market = s.odds = s.outcome = s.units = undefined;
    const screen = marketScreen(s);
    return editHtml(ctx, screen.text, screen.kb);
  }
  if (step === 3) return showSelections(ctx, s);
  s.units = undefined;
  const screen = unitsScreen(s);
  return editHtml(ctx, screen.text, screen.kb);
}

async function lockPick(ctx: Context, s: PickSession) {
  const chat = ctx.chat;
  const from = ctx.from;
  const username = from?.username;
  if (!chat || !from) return;
  if (!username) return editHtml(ctx, esc(NO_USERNAME));
  if (!s.sport || !s.event || !s.market || !s.outcome || s.units === undefined)
    return;
  await editHtml(ctx, [...summary(s), "", "Locking pick."].join("\n"));
  try {
    const pick = await api.createPick({
      telegramUserId: String(from.id),
      telegramUsername: username,
      chatId: String(chat.id),
      sportKey: s.sport,
      eventId: s.event.id,
      market: s.market,
      selection: s.outcome.selection,
      units: s.units,
    });
    endSession(chat.id, from.id);
    await trackChat(chat.id);
    logger.info("Pick locked", {
      pickId: pick.id,
      guildId: guildIdFor(chat.id),
    });
    await editHtml(ctx, pickMessage(pick));
  } catch (err) {
    endSession(chat.id, from.id);
    if (!(err instanceof ApiError)) throw err;
    await editHtml(
      ctx,
      `Pick not locked: ${esc(err.message)}\nSend /pick to start again.`,
    );
  }
}

async function handle(
  ctx: Context,
  s: PickSession,
  action: string,
  arg: number,
) {
  if (action === "x") {
    if (ctx.chat && ctx.from) endSession(ctx.chat.id, ctx.from.id);
    return editHtml(ctx, "Pick cancelled.");
  }
  if (action === "b") return goBack(ctx, s, arg);
  if (action === "s") {
    const sport = SPORTS[arg];
    return sport ? showEvents(ctx, s, sport.value) : undefined;
  }
  if (action === "p") {
    s.page = arg;
    const screen = eventScreen(s);
    return editHtml(ctx, screen.text, screen.kb);
  }
  if (action === "e") {
    const event = s.events?.[arg];
    if (!event) return;
    if (!isUpcoming(event)) {
      s.events = s.events?.filter((e) => isUpcoming(e));
      const screen = eventScreen(s);
      return editHtml(
        ctx,
        `That event has started.\n${screen.text}`,
        screen.kb,
      );
    }
    s.event = event;
    const screen = marketScreen(s);
    return editHtml(ctx, screen.text, screen.kb);
  }
  if (action === "m") {
    const market = MARKETS[arg];
    if (!market) return;
    s.market = market.value;
    return showSelections(ctx, s);
  }
  if (action === "o") {
    const outcome = s.odds?.outcomes[arg];
    if (!outcome) return;
    s.outcome = outcome;
    const screen = unitsScreen(s);
    return editHtml(ctx, screen.text, screen.kb);
  }
  if (action === "u") {
    const units = UNITS[arg];
    if (units === undefined) return;
    s.units = units;
    const screen = confirmScreen(s);
    return editHtml(ctx, screen.text, screen.kb);
  }
  if (action === "ok") return lockPick(ctx, s);
}

export const pickCommand = new Composer();

pickCommand.command("pick", async (ctx) => {
  const from = ctx.from;
  if (!from || from.is_bot) {
    await replyHtml(
      ctx,
      "Anonymous admins cannot lock picks. Post as yourself.",
    );
    return;
  }
  if (!from.username) {
    await replyHtml(ctx, esc(NO_USERNAME));
    return;
  }
  const screen = sportScreen({});
  const msg = await replyHtml(ctx, screen.text, screen.kb);
  startSession(ctx.chat.id, from.id, msg.message_id);
});

pickCommand.callbackQuery(/^pk:([a-z]+)(?::(\d+))?$/, async (ctx) => {
  const messageId = ctx.callbackQuery.message?.message_id;
  const chatId = ctx.chat?.id;
  const session =
    messageId === undefined || chatId === undefined
      ? null
      : getSession(chatId, ctx.from.id, messageId);
  if (!session) {
    await ctx.answerCallbackQuery({
      text: "This menu is not yours or has expired. Send /pick to start your own.",
      show_alert: true,
    });
    return;
  }
  if (session.busy) {
    await ctx.answerCallbackQuery({ text: "Working on it." });
    return;
  }
  session.busy = true;
  try {
    await ctx.answerCallbackQuery();
    await handle(ctx, session, ctx.match[1] ?? "", Number(ctx.match[2] ?? 0));
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
    if (chatId !== undefined) endSession(chatId, ctx.from.id);
    await editHtml(ctx, `${esc(err.message)}\nSend /pick to start again.`);
  } finally {
    session.busy = false;
  }
});

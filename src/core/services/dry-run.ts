import { LINK_INVALID, linkedMessage } from "@/core/messages/help.message";
import { arbMessage } from "@/core/messages/arb.message";
import type { OutgoingMessage } from "@/core/messages/alert.message";
import {
  chatSettingsMessage,
  personalStatusMessage,
} from "@/core/messages/settings.message";
import { replayForDryRun, startAlertsFeed } from "@/core/services/alerts.feed";
import {
  DEFAULT_SETTINGS,
  type ChatAlertSettings,
  setChatSettingsInMemory,
} from "@/core/services/chat-settings";
import { startQueue } from "@/core/services/send.queue";
import { allSubscribers, startSubscribers } from "@/core/services/subscribers";
import { logger } from "@/lib/logger";
import { fetchArbs } from "@/lib/openev/client";
import { EVENTS_URL } from "@/lib/openev/events";
import { linkTelegram } from "@/lib/openev/internal";
import { OPENEV_API_URL } from "@/shared/config/env";

const REPLAY = 3;

const CHATS: [number, ChatAlertSettings][] = [
  [
    -1001000000001,
    { ...DEFAULT_SETTINGS, enabled: true, arbs: true, minArbProfit: 0.005 },
  ],
  [
    -1001000000002,
    {
      ...DEFAULT_SETTINGS,
      enabled: true,
      minEv: 0.04,
      minConfidence: "medium",
      books: ["ubuk", "ladbrokes", "coral", "smarkets"],
    },
  ],
];

function print(kind: string, body: Record<string, unknown>): void {
  console.log(JSON.stringify({ dryRun: kind, ...body }, null, 2));
}

function rendered(message: OutgoingMessage) {
  return {
    text: message.text,
    buttons: message.keyboard.inline_keyboard,
  };
}

// No Telegram login, no state written: rendered messages and fan out decisions go to stdout as JSON.
export async function runDryRun(): Promise<void> {
  logger.info("Dry run", { api: OPENEV_API_URL, events: EVENTS_URL });
  startQueue(async (chatId, message) =>
    print("send", { chat_id: chatId, ...rendered(message) }),
  );
  for (const [chatId, settings] of CHATS) {
    setChatSettingsInMemory(chatId, settings);
    print("chat settings", {
      chat_id: chatId,
      text: chatSettingsMessage(settings),
    });
  }
  await startSubscribers();

  const linked = await linkTelegram("dryruntoken", 111111111, "dry_run_user");
  print("start with token", {
    text: linked.ok ? linkedMessage(linked.displayName) : LINK_INVALID,
  });
  const first = allSubscribers()[0];
  if (first) {
    print("me", { text: personalStatusMessage(first, false, false) });
  }

  const arb = (await fetchArbs(0).catch(() => [])).find((a) => !a.check);
  if (arb) print("sample arb", rendered(arbMessage(arb)));
  else logger.info("No arb on the board right now");

  await replayForDryRun(REPLAY);
  await startAlertsFeed();
}

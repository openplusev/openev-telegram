# openev-telegram

Telegram alert bot for OpenEV: value bets and arbs from 35 bookmakers, priced against the
Pinnacle fair line, with a public ledger of every alert and its closing line
(https://openev.coding-global.com/en/proof). It mirrors the Discord bot (`openev-bot`): the
bot posts what the ledger records, never the raw value bet board, so Telegram, Discord and the
proof page show the same alerts.

Two kinds of alerts:

- **Groups and channels.** An admin adds the bot and sends `/alerts on`. Each chat has its own
  filters (minimum EV, books, minimum confidence, arbs with a minimum profit) and stakes shown
  per 1000 at quarter Kelly.
- **Personal.** A user links their OpenEV account (Discord login) from the website settings.
  Alerts go to their private chat with the bot, filtered by the prefs they set on the website
  and staked from their bankroll and Kelly fraction in their currency.

## Commands

| Command              | What it does                                                                        |
| -------------------- | ----------------------------------------------------------------------------------- |
| `/alerts`            | This chat's alert settings. Changes are admin only in groups.                       |
| `/alerts on`         | Post alerts here. `/alerts off` stops them.                                         |
| `/alerts ev 3`       | Minimum EV in percent (the ledger starts at 2).                                     |
| `/alerts books`      | `ubuk ladbrokes` (codes as in `/v1/books`) or `all`.                                |
| `/alerts confidence` | `low`, `medium` or `high`.                                                          |
| `/alerts arbs`       | `on 1.5` (minimum profit in percent) or `off`.                                      |
| `/alerts settings`   | Settings plus the usage above.                                                      |
| `/me`                | Personal status: linked account, filters, stake sizing, link to settings.           |
| `/stop`              | Pause personal alerts in this chat. `/start` resumes them.                          |
| `/start <token>`     | Link this private chat to an OpenEV account (from Connect Telegram on the website). |
| `/help`              | What the bot does and the command list.                                             |

In a channel every post comes from an admin, so `/alerts` works there as is. Anonymous group
admins count as admins.

## Alert message

HTML, one message per alert: selection and book, match, market and league; odds against fair
odds (plus the current price or "price gone" when it moved); EV and safe EV (the conservative
EV, shown while the alerted price still stands); confidence; kickoff in UTC with a relative
hint; the stake (per 1000 at quarter Kelly in chats, a whole amount of the user's currency from
their bankroll and Kelly fraction in personal alerts); the footer "Check the price at the book
before betting."; buttons Bet details (`/en/value-bets/{id}`) and Game (`/en/games/{id}`).
Arbs list every leg with its odds and stake share of 1000, with buttons All arbs and Game.

## How it works

- **Events.** The bot keeps a WebSocket to `OPENEV_API_URL/v1/ws` and subscribes to `ledger`
  and `arbs`. Each `ledger_added` is fanned out; each `arb_added` (and an arb first seen in the
  snapshot after a reconnect) goes to chats and users with arbs on. The bot pings every 20 s,
  since the API closes silent sockets after 60 s, and reconnects with backoff up to 60 s.
- **Catch up.** After every (re)connect the bot reads `GET /v1/ledger` and sends the entries
  newer than its watermark, if they are at most 30 minutes old and the game has not started.
  The very first start only marks the current ledger as seen.
- **Dedupe.** Ledger ids sent to each chat are persisted for 48 hours, so a reconnect or a
  restart never posts an alert twice in the same chat. A chat that gets a personal alert does
  not get the same alert again through its chat settings.
- **Personal.** Subscribers are refreshed every 60 s. For every matching subscriber the bot
  first records the delivery and only sends when the record was created (409 means another
  instance or an earlier run already sent it). A user who blocked the bot (403) is logged once
  and skipped until they link again. Arbs for personal alerts are deduped by the bot only.
- **Rate limits.** One send queue: at most 25 messages a second overall, 1 a second per
  private chat and one every 3.1 s per group or channel (Telegram allows about 30 a second, 1
  a second per chat, 20 a minute per group). A 429 waits `retry_after` and retries. A chat that
  removed the bot gets alerts switched off; a group upgraded to a supergroup moves its settings.

## Account linking

1. The user opens https://openev.coding-global.com/en/settings and presses Connect Telegram.
2. The site calls `POST /v1/me/telegram/link` and sends them to `https://t.me/<bot>?start=<token>`.
3. The bot gets `/start <token>` and calls `POST /v1/internal/telegram/link`; it answers with a
   confirmation or a clear error (expired or used link, or the API unreachable).

## Run

```bash
cp .env.example .env   # fill TELEGRAM_BOT_TOKEN and INTERNAL_TOKEN
bun install
bun dev
```

Set `DATA_DIR=./data` and `OPENEV_API_URL=http://127.0.0.1:8104` (or wherever the local API
listens) when running outside the container. Long polling, so no public URL or webhook is
needed. Commands are registered with `setMyCommands` on every start.

`DRY_RUN=1` never logs in to Telegram and never writes `DATA_DIR`. It prints as JSON: sample
chat settings, the `/start` link confirmation, `/me`, a sample arb, then the newest three open
ledger alerts replayed through the whole fan out (decisions per chat and per subscriber, plus
every rendered message), then keeps following live events. Two mock groups are configured
(defaults with arbs on; 4% EV, medium confidence, four UK books). Without `INTERNAL_TOKEN`, or
while the internal endpoints answer 404, subscribers are mocked; deliveries and linking are
always mocked in a dry run.

```bash
DRY_RUN=1 OPENEV_API_URL=http://127.0.0.1:8104 bun src/main.ts
```

| Variable             | Default                                  |
| -------------------- | ---------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | required, from BotFather                 |
| `INTERNAL_TOKEN`     | required for linking and personal alerts |
| `OPENEV_API_URL`     | `http://openev-api:8080`                 |
| `OPENEV_WEBSITE_URL` | `https://openev.coding-global.com`       |
| `DATA_DIR`           | `/app/data`                              |
| `DRY_RUN`            | off; `1` renders to stdout               |
| `LOG_LEVEL`          | `info` in production, `debug` in dev     |

## API contract

Public endpoints come from the API's OpenAPI spec: `bun run api:types` regenerates
`src/lib/openev/schema.d.ts` (default `http://127.0.0.1:8104`, override with `OPENEV_API_URL`),
and `openapi-fetch` calls them. Used: `GET /v1/ledger`, `GET /v1/value-bets/{id}`,
`GET /v1/arbs`, `GET /v1/books`, `GET /v1/ws`.

Internal endpoints are not in the spec yet and are checked by hand in
`src/lib/openev/internal.ts`. Every call sends `X-Internal-Token: <INTERNAL_TOKEN>`.

| Method | Path                             | Body or response                                                                                                                                                                                       |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/v1/internal/telegram/link`     | `{token, chat_id, username}` gives `{user_id, display_name}`, or 404 with `code: "invalid_token"`                                                                                                      |
| GET    | `/v1/internal/alert-subscribers` | `[{user_id, discord_id, display_name, prefs: {enabled, min_ev, books, min_confidence, arbs, min_arb_profit, channels: {discord_dm, telegram}}, bankroll, kelly_fraction, currency, telegram_chat_id}]` |
| POST   | `/v1/internal/alert-deliveries`  | `{user_id, ledger_id, channel: "telegram"}`; 2xx means recorded, 409 already sent                                                                                                                      |

## Deploy

Komodo stack on the Netcup box: Komodo clones this repo and runs `docker compose build` and
`up`. Runtime env comes from the stack's `.env`. The Dockerfile builds a single Bun binary on
distroless for amd64 or arm64. The container joins the external `proxy` network, where the API
answers as `openev-api:8080` (REST and WebSocket, without the Traefik limits of the public
`/v1/ws` route). State lives in the named volume `opencapper-telegram_opencapper-telegram-data`
at `/app/data`: `openev-chats.json` (chat settings), `openev-alerts.json` (watermark, sent ids,
seen arbs), `openev-personal.json` (paused chats, blocked users).

## License

AGPL-3.0-only. See [LICENSE](LICENSE).

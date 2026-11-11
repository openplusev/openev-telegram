# openev-telegram

Telegram bot for OpenCapper, the verified sports picks platform. The third client of the
OpenCapper API next to the web app and the Discord bot (`openev-bot`). Cappers lock picks
with `/pick`, the API captures the odds and grades them, and `/recap` posts the chat's honest
record. The bot keeps no database: every read and write goes through the API.

Works in private chats and groups. In a group the record belongs to the group: the API sees
it as `guildId` `tg:<chatId>`.

## Commands

| Command                         | What it does                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `/pick`                         | Guided inline keyboard: sport, event, market, selection with live line, units.   |
| `/recap [days]`                 | Record, units and ROI per capper in this chat, sorted by units. Default 7 days.  |
| `/record [username]`            | One capper's verified record. Default your own Telegram username.                |
| `/leaderboard [sport] [period]` | Top 10 cappers by ROI, e.g. `/leaderboard nba 90d`. Default all sports, 30 days. |
| `/verify <pick>`                | Link to the public proof page of a pick, by number (`42`, `#42`) or id.          |
| `/help`, `/start`               | What the bot does and the command list.                                          |

`/pick` needs a Telegram username, since public profiles are keyed by it. The flow lives in
one message that is edited step by step; only the user who started it can press its buttons,
and it expires after 15 minutes of inactivity (state is in memory, a restart drops open
flows). The confirm screen says that the odds are captured when the pick is locked and that a
locked pick can never be edited or deleted. The final message shows the captured odds,
bookmaker, timestamp, profile link and verify link.

## Results feed

Every 5 minutes the bot asks the API for picks settled in each chat since the last post and
posts one result message per pick (win, loss, push or void, units won or lost, captured vs
closing odds and CLV when known) into that chat. A chat is tracked from its first pick made
through this bot, never backfilled. Chat ids and watermarks live in
`DATA_DIR/results-watermarks.json` (default `/app/data`, a named docker volume), so restarts
do not repost. A chat the bot was removed from is dropped. A 404 from the endpoint is treated
as not deployed yet and skipped quietly.

## Run

```bash
cp .env.example .env   # fill TELEGRAM_BOT_TOKEN and BOT_API_TOKEN
bun install
bun dev
```

Set `DATA_DIR=./data` locally; the default `/app/data` only exists in the container. Long
polling, so no public URL or webhook is needed. Commands are registered with `setMyCommands`
on every start.

| Variable             | Default                                    |
| -------------------- | ------------------------------------------ |
| `TELEGRAM_BOT_TOKEN` | required, from BotFather                   |
| `BOT_API_TOKEN`      | required for writes                        |
| `OPENCAPPER_API_URL` | `https://opencapper.coding-global.com/api` |
| `WEBSITE_URL`        | `https://opencapper.coding-global.com`     |
| `DATA_DIR`           | `/app/data`                                |
| `LOG_LEVEL`          | `info` in production, `debug` in dev       |

## API contract

Base `OPENCAPPER_API_URL`. Every request sends `Authorization: Bearer <BOT_API_TOKEN>`.
Errors return a non 2xx status with `{ "error": "message" }`; the message is shown to the user
as is. Types live in `src/lib/api.ts`.

| Method | Path                                              | Response              |
| ------ | ------------------------------------------------- | --------------------- |
| GET    | `/events?sport=<sportKey>`                        | `ApiEvent[]`          |
| GET    | `/events/:sportKey/:eventId/odds` (public)        | `ApiEventOdds`        |
| POST   | `/picks` (body `CreatePickRequest`)               | `ApiPick`             |
| GET    | `/recap?guildId=tg:<chatId>&from=&to=` (ISO 8601) | `RecapResponse`       |
| GET    | `/picks/settled?guildId=tg:<chatId>&since=` (ISO) | `ApiSettledPick[]`    |
| GET    | `/users/:username/stats`                          | `CapperStats`         |
| GET    | `/leaderboard?sport=&period=&sort=roi`            | `LeaderboardResponse` |

`ApiEvent`: `id`, `home`, `away`, `commenceTime`, optional `homeImage`, `awayImage`,
`homeCountry`, `awayCountry`.

`ApiEventOdds`: `{ eventId, home, away, commenceTime, markets }`, each market
`{ market, bookmaker, outcomes }`, each outcome `{ name, point, odds, selection }` with
American `odds`. The selection buttons use the first market entry of the chosen market and
post its `selection` string.

`CreatePickRequest`: `{ telegramUserId, telegramUsername, chatId, sportKey, eventId, market,
selection, units }`, ids as strings, `market` one of `h2h`, `spreads`, `totals`, `units` one
of 0.5, 1, 2, 3, 5. The API captures the odds itself.

`ApiPick` carries optional `closingOdds` (American), `clv` (fraction like `roi`) and `logSeq`
(transparency log position). `ApiSettledPick` is `ApiPick` plus `settledAt` (ISO).
`/picks/settled` returns picks of that chat whose `settledAt` is strictly after `since`,
oldest first, result not `pending`. Units won on a win are `units * odds / 100` (plus odds)
or `units * 100 / |odds|`.

`/leaderboard`: `sport` is a sport key and omitted for all sports, `period` is `30d`, `90d`,
`1y` or `all`. A 404 shows "The leaderboard is coming soon."

`/verify` needs no API call: it links to `WEBSITE_URL/en/verify?pick=<ref>`.

## Deploy

Komodo stack on the Netcup box: Komodo clones this repo and runs `docker compose build` and
`up`. Runtime env comes from the stack's `.env`. The Dockerfile builds a single Bun binary on
distroless for amd64 or arm64.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).

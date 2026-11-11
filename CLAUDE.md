# CLAUDE.md: openev-telegram

OpenEV alert bot for Telegram. The API is `../openev-api` (Rust, OpenAPI at `/v1/openapi.json`),
the web app is `../openev`, the Discord bot is `../openev-bot`; alert behaviour and wording mirror
the Discord bot (`src/core/embeds/alert.embed.ts` there).

## Rules

- bun for everything. No tests unless asked.
- No dashes as punctuation (em, en, `--`), no Unicode arrows, curly quotes or ellipsis, no emojis. Applies to code, comments, docs, buttons, messages and commit messages.
- Comments only for a non obvious why, one terse line.
- Never `as` to silence a type. WebSocket frames take an annotated `const msg: ServerMessage = JSON.parse(...)` (`src/lib/openev/events.ts`); state files take runtime guards (`src/lib/state.ts`).
- No barrel files. No TS enums: union literals derived from `as const` arrays (`ALERT_CONFIDENCES`).
- No database here. State belongs to the API; the exceptions are the JSON files in `DATA_DIR`, written only through `src/lib/state.ts`.
- OpenEV types are generated (`bun run api:types`, `src/lib/openev/schema.d.ts`), never written by hand. The internal endpoints (`src/lib/openev/internal.ts`) use the same generated types with the `X-Internal-Token` header.
- Every message is sent with `parse_mode: "HTML"`: pass every user or API string through `esc` or `link` from `src/core/utils/html.utils.ts`.
- No Co-Authored-By or AI references in git.

## Traps

- Every command is a grammY `Composer` and must be added in `src/bot/index.ts`, or it never runs. `command()` also matches channel posts, which is why `allowed_updates` includes `channel_post`.
- Transport is the API WebSocket (`/v1/ws` on `openev-api:8080` over the `proxy` network), not Valkey: `openev-valkey` is only on the API stack's own project network. The API closes a socket silent for 60 s, so the bot sends `{"type":"ping"}` every 20 s.
- The bot posts what the ledger records (`ledger_added`), never `/v1/value-bets` directly. Safe EV is not in a ledger entry; it comes from `GET /v1/value-bets/{id}` and is shown only while the alerted price still stands.
- The API stamps every alert of one snapshot with the same `alerted_at`, so the catch up watermark keeps the ids at `since`. The first start without state sends nothing. Catch up skips entries older than 30 minutes.
- Personal deliveries are recorded with the API before sending (`POST /v1/internal/alert-deliveries`, 201 created, 409 already recorded); only a created record sends. Arbs are recorded as `ledger_id` `arb:<arb id>`, like the Discord bot. Never send on a failed record, or two instances could double send.
- `/stop` pauses Telegram only (local `muted` set); the website prefs stay. `/start` without a token resumes. A 403 marks the user blocked for that chat id; a successful relink clears it.
- Telegram ids above 2^31 are still safe integers in JS, and group and channel ids are negative; the send queue spaces negative ids 3.1 s apart for the 20 per minute group limit.
- `DRY_RUN=1` never logs in and never writes `DATA_DIR`; it mocks deliveries and linking, and subscribers when `INTERNAL_TOKEN` is unset, the endpoint fails or the list is empty.
- `DATA_DIR` must be writable by distroless `nonroot`: the Dockerfile copies an owned `/app/data` so the named volume inherits it. A bind mount would need `chown 65532`. The volume keeps its old name `opencapper-telegram_opencapper-telegram-data`.
- `openapi-typescript` needs the TypeScript 5 JS API, which TypeScript 7 lacks, so `api:types` runs it through `bunx`.
- Komodo: the compose service needs `env_file: .env` or the container gets no env. Network `proxy` is external and must already exist on the host.
- Long polling: only one instance per token may run, a second one gets 409 Conflict.
- The shipped artifact is the `bun build --compile` binary from the Dockerfile; `bun run build` builds the same into `dist/bot`.

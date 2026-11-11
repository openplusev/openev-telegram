# CLAUDE.md: openev-telegram

Product decisions live in `../claude.md`. The web app and API are the `openev` repo, the
Discord bot is `openev-bot`; this repo mirrors the bot's structure.

## Rules

- bun for everything. No tests unless asked.
- No dashes as punctuation (em, en, `--`), no Unicode arrows, curly quotes or ellipsis, no emojis. Applies to code, comments, docs, buttons, messages and commit messages.
- Comments only for a non obvious why, one terse line.
- Never `as` to silence a type. The single allowed cast is the JSON boundary in `src/lib/api.ts`.
- No barrel files. No TS enums: union literals derived from `as const` arrays (`src/shared/config/sports.ts`).
- No database here. State belongs to the API; the one exception is the results feed file in `DATA_DIR`.
- Every message is sent with `parse_mode: "HTML"`: pass every user or API string through `esc` or `link` from `src/core/utils/html.utils.ts`.
- No Co-Authored-By or AI references in git.

## Traps

- The API contract and types are mirrored by hand from `openev-bot/src/lib/api.ts` (no shared package) plus the Telegram parts. Change the API, both bots and both READMEs together.
- Telegram chats map to `guildId` `tg:<chatId>` (`guildIdFor` in `results.feed.ts`). Group chat ids are negative; a group upgraded to a supergroup gets a new id and starts a fresh record.
- Every command is a grammY `Composer` and must be added in `src/bot/index.ts`, or it never runs.
- Callback data is capped at 64 bytes, so `/pick` buttons carry only `pk:<action>:<index>` into the in memory session (`src/core/services/pick.session.ts`). Sessions are keyed by chat and user and bound to one message id; a restart drops them.
- Every callback query must be answered, or the button spinner hangs for the user.
- `editMessageText` without `reply_markup` removes the keyboard; "message is not modified" is swallowed in `editHtml`.
- `/record` and `/pick` key profiles by Telegram username, which users may not have. `GroupAnonymousBot` (anonymous admins) is rejected in `/pick`.
- In groups with privacy mode on, the bot only sees commands, which is all it needs. `/pick@Bot` works because `bot.init()` runs before polling.
- The results feed only polls chats where a pick was locked through this bot. Watermarks advance per posted pick; a failed send is skipped, a 429 is retried next tick, a 403 drops the chat.
- `DATA_DIR` must be writable by distroless `nonroot`: the Dockerfile copies an owned `/app/data` so the named volume inherits it. A bind mount would need `chown 65532`.
- Komodo: the compose service needs `env_file: .env` or the container gets no env. Network `proxy` is external and must already exist on the host.
- Long polling: only one instance per token may run, a second one gets 409 Conflict.
- The shipped artifact is the `bun build --compile` binary from the Dockerfile; `bun run build` builds the same into `dist/bot`.

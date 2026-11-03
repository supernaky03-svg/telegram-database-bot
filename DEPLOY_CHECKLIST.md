# v2.1.0 Production Deployment Checklist

## Before first deploy
- [ ] Confirm `wrangler.jsonc` `database_id` belongs to the intended Cloudflare D1 database.
- [ ] Confirm database name is `telegram-file-store-bot-db` and binding is `DB`.
- [ ] Add the Telegram bot token and webhook secret as Worker runtime Secrets.
- [ ] Add `SOURCE_CHANNEL_ID`, `STORE_CHANNEL_ID`, `REPOST_CHANNEL_ID` as Worker runtime Secrets.
- [ ] Add at least one `JOIN_CHANNELn_ID` + `JOIN_CHANNELn_LINK` pair (up to 30).
- [ ] Set `BOT_USERNAME` to the actual bot username without `@`.
- [ ] Add the bot as Admin to Source, Store, Repost and every required-join channel.
- [ ] Give the bot Post Messages permission in Repost Channel.
- [ ] In Workers Builds, set Build command `npm run check` and Deploy command `npm run deploy`.
- [ ] Confirm the selected Workers Builds API token has Worker deployment access and **Account → D1 → Edit**; the default auto-generated token may not include D1.
- [ ] Ensure Preview builds are disabled or use a separate Preview D1 database and secrets.

## Deploy and verify
- [ ] Push/merge the release to the configured production branch.
- [ ] Confirm the build log shows D1 migrations applied before `wrangler deploy`.
- [ ] Open `/health` and confirm `ok`, `database`, and `deliveryCleanup` are true.
- [ ] Configure Telegram webhook with `node scripts/set-webhook.mjs`.
- [ ] Check `getWebhookInfo` and verify the webhook URL and no persistent last error.
- [ ] Test Source-first: Source Review → Source video → Store video.
- [ ] Test Store-first: Store video → Source Review → Source video.
- [ ] Test latest duplicate-caption Source video without Review; it must not fall back to an older Review.
- [ ] Test membership gate and removal from a required-join channel.
- [ ] Test actual download, 3-hour cleanup (or a test-only shorter duration in a non-production environment), and Get File Again.
- [ ] Check Worker logs and D1 tables after each test.

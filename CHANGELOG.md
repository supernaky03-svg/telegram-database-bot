# Changelog

## 2.1.0 — Production candidate

- Added a 7-day `pending_store_videos` queue for Store-first arrival.
- Re-run matching when matching Source video or a delayed nearest preceding Source post is indexed.
- Always select the latest matching Source video by Telegram message ID; do not fall back to older reviews when the latest match has no preceding post.
- Added 5-minute cron recovery for pending Store posts and retryable failures.
- Added D1 migration `0002_production_matching.sql` to rebuild retryable Store states and create the pending Store table/index.
- Changed `npm run deploy` to apply remote D1 migrations before deploying the Worker.
- Moved core channel IDs and required-join channel configuration out of Wrangler vars and into runtime Secret bindings.
- Added 30-channel `JOIN_CHANNELn_*` support and retained v2.0 channel binding aliases for upgrades.
- Improved source event index ordering for late/out-of-order events.
- Kept Durable Object Alarm deletion persistent and added a persisted post-delete phase.
- Expanded CI checks and deployment documentation.

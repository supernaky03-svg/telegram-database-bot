-- Telegram File Store Bot v2.0
-- Timestamps are Unix seconds.
-- Retention policy:
--   processed_store + telegram_updates: 72 hours
--   pending_source_posts + source_events: 168 hours
--   downloads: retained while the repost button is intended to remain usable

CREATE TABLE IF NOT EXISTS telegram_updates (
    update_id INTEGER PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('processing', 'done', 'retry')),
    lease_until INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_updates_updated
    ON telegram_updates(updated_at);

CREATE TABLE IF NOT EXISTS source_events (
    source_channel_id TEXT NOT NULL,
    source_message_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    is_video INTEGER NOT NULL DEFAULT 0,
    caption_normalized TEXT,
    caption_original TEXT,
    preceding_review_message_id INTEGER,
    PRIMARY KEY (source_channel_id, source_message_id)
);

CREATE INDEX IF NOT EXISTS idx_source_events_previous
    ON source_events(source_channel_id, source_message_id DESC);

CREATE TABLE IF NOT EXISTS pending_source_posts (
    source_channel_id TEXT NOT NULL,
    source_message_id INTEGER NOT NULL,
    caption_normalized TEXT NOT NULL,
    caption_original TEXT,
    preceding_review_message_id INTEGER,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (source_channel_id, source_message_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_source_caption_latest
    ON pending_source_posts(source_channel_id, caption_normalized, source_message_id DESC, expires_at);

CREATE TABLE IF NOT EXISTS processed_store (
    store_channel_id TEXT NOT NULL,
    store_message_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('processing', 'success', 'skipped_no_match', 'skipped_no_review', 'failed')
    ),
    processed_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    lease_until INTEGER NOT NULL DEFAULT 0,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    repost_message_id INTEGER,
    download_token TEXT,
    error_text TEXT,
    PRIMARY KEY (store_channel_id, store_message_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_store_expiry
    ON processed_store(expires_at);

CREATE TABLE IF NOT EXISTS downloads (
    token TEXT PRIMARY KEY,
    store_channel_id TEXT NOT NULL,
    store_message_id INTEGER NOT NULL,
    source_channel_id TEXT NOT NULL,
    source_message_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    repost_message_id INTEGER,
    UNIQUE (store_channel_id, store_message_id)
);

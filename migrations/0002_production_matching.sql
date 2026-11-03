-- v2.1.0: pending Store records + explicit retryable processing state.
-- v2.0 did not persist captions for skipped Store posts, so those historical
-- rows cannot be re-indexed automatically. Keep them marked as legacy_skipped.
-- New Store posts are indexed in pending_store_videos for 7-day recovery.

DROP INDEX IF EXISTS idx_processed_store_expiry;

ALTER TABLE processed_store RENAME TO processed_store_v2_old;

CREATE TABLE processed_store (
    store_channel_id TEXT NOT NULL,
    store_message_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('processing', 'success', 'pending_match', 'skipped_empty_caption', 'legacy_skipped', 'failed')
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

INSERT INTO processed_store (
    store_channel_id, store_message_id, status,
    processed_at, updated_at, expires_at, lease_until, attempt_count,
    repost_message_id, download_token, error_text
)
SELECT
    store_channel_id,
    store_message_id,
    CASE
      WHEN status IN ('skipped_no_match', 'skipped_no_review') THEN 'legacy_skipped'
      ELSE status
    END,
    processed_at,
    updated_at,
    expires_at,
    lease_until,
    attempt_count,
    repost_message_id,
    download_token,
    CASE
      WHEN status IN ('skipped_no_match', 'skipped_no_review') THEN
        'Legacy v2.0 skip: original caption was not stored; repost the Store video after upgrade to index it.'
      ELSE error_text
    END
FROM processed_store_v2_old;

DROP TABLE processed_store_v2_old;

CREATE INDEX idx_processed_store_expiry ON processed_store(expires_at);

CREATE TABLE IF NOT EXISTS pending_store_videos (
    store_channel_id TEXT NOT NULL,
    store_message_id INTEGER NOT NULL,
    caption_normalized TEXT NOT NULL,
    caption_original TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (store_channel_id, store_message_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_store_caption
    ON pending_store_videos(store_channel_id, caption_normalized, created_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_source_events_caption_latest
    ON source_events(source_channel_id, caption_normalized, source_message_id DESC, created_at);

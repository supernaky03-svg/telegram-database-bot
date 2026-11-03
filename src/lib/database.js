const HOURS = 60 * 60;
export const UPDATE_RETENTION_SECONDS = 72 * HOURS;
export const STORE_DEDUPE_SECONDS = 72 * HOURS;
export const SOURCE_RETENTION_SECONDS = 7 * 24 * HOURS;
export const LEASE_SECONDS = 120;

export async function claimTelegramUpdate(db, updateId, now) {
  if (!Number.isSafeInteger(updateId)) return "claimed";

  const result = await db.prepare(`
    INSERT INTO telegram_updates (update_id, status, lease_until, updated_at)
    VALUES (?, 'processing', ?, ?)
    ON CONFLICT(update_id) DO UPDATE SET
      status = 'processing',
      lease_until = excluded.lease_until,
      updated_at = excluded.updated_at
    WHERE telegram_updates.status != 'done'
      AND (telegram_updates.status != 'processing' OR telegram_updates.lease_until <= ?)
  `).bind(updateId, now + LEASE_SECONDS, now, now).run();

  if (Number(result?.meta?.changes ?? 0) > 0) return "claimed";

  const existing = await db.prepare(`
    SELECT status, lease_until FROM telegram_updates WHERE update_id = ?
  `).bind(updateId).first();

  if (existing?.status === "done") return "done";
  return "busy";
}

export async function finishTelegramUpdate(db, updateId, ok, now) {
  if (!Number.isSafeInteger(updateId)) return;
  await db.prepare(`
    UPDATE telegram_updates
    SET status = ?, lease_until = 0, updated_at = ?
    WHERE update_id = ?
  `).bind(ok ? "done" : "retry", now, updateId).run();
}

export async function claimStorePost(db, storeChannelId, storeMessageId, now) {
  const result = await db.prepare(`
    INSERT INTO processed_store (
      store_channel_id, store_message_id, status,
      processed_at, updated_at, expires_at, lease_until, attempt_count
    )
    VALUES (?, ?, 'processing', ?, ?, ?, ?, 1)
    ON CONFLICT(store_channel_id, store_message_id) DO UPDATE SET
      status = 'processing',
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at,
      lease_until = excluded.lease_until,
      attempt_count = processed_store.attempt_count + 1,
      error_text = NULL
    WHERE processed_store.expires_at <= ?
       OR processed_store.status = 'failed'
       OR (processed_store.status = 'processing' AND processed_store.lease_until <= ?)
  `).bind(
    storeChannelId,
    storeMessageId,
    now,
    now,
    now + STORE_DEDUPE_SECONDS,
    now + LEASE_SECONDS,
    now,
    now
  ).run();

  if (Number(result?.meta?.changes ?? 0) > 0) {
    return { claimed: true, busy: false };
  }

  const existing = await db.prepare(`
    SELECT status, lease_until
    FROM processed_store
    WHERE store_channel_id = ? AND store_message_id = ?
  `).bind(storeChannelId, storeMessageId).first();

  return {
    claimed: false,
    busy: existing?.status === "processing" && Number(existing.lease_until) > now
  };
}

export async function finishStorePost(db, storeChannelId, storeMessageId, values, now) {
  const {
    status,
    repostMessageId = null,
    downloadToken = null,
    errorText = null
  } = values;

  await db.prepare(`
    UPDATE processed_store
    SET status = ?, updated_at = ?, lease_until = 0,
        repost_message_id = ?, download_token = ?, error_text = ?
    WHERE store_channel_id = ? AND store_message_id = ?
  `).bind(
    status,
    now,
    repostMessageId,
    downloadToken,
    errorText ? String(errorText).slice(0, 500) : null,
    storeChannelId,
    storeMessageId
  ).run();
}

export async function findLatestSourceMatch(db, sourceChannelId, captionNormalized, now) {
  return db.prepare(`
    SELECT source_channel_id, source_message_id, preceding_review_message_id,
           caption_normalized, caption_original, created_at
    FROM source_events
    WHERE source_channel_id = ?
      AND is_video = 1
      AND caption_normalized = ?
      AND created_at > ?
    ORDER BY source_message_id DESC
    LIMIT 1
  `).bind(sourceChannelId, captionNormalized, now - SOURCE_RETENTION_SECONDS).first();
}

export async function recordSourcePost(db, channelId, message, now, captionNormalized, isVideo) {
  const messageId = Number(message.message_id);
  const previous = await db.prepare(`
    SELECT source_message_id
    FROM source_events
    WHERE source_channel_id = ?
      AND source_message_id < ?
      AND created_at > ?
    ORDER BY source_message_id DESC
    LIMIT 1
  `).bind(channelId, messageId, now - SOURCE_RETENTION_SECONDS).first();

  await db.prepare(`
    INSERT OR IGNORE INTO source_events (
      source_channel_id, source_message_id, created_at, is_video,
      caption_normalized, caption_original, preceding_review_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    channelId,
    messageId,
    now,
    isVideo ? 1 : 0,
    isVideo && captionNormalized ? captionNormalized : null,
    isVideo && typeof message.caption === "string" ? message.caption.slice(0, 4096) : null,
    isVideo ? (previous?.source_message_id ?? null) : null
  ).run();

  if (isVideo && captionNormalized) {
    await db.prepare(`
      INSERT INTO pending_source_posts (
        source_channel_id, source_message_id, caption_normalized,
        caption_original, preceding_review_message_id, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_channel_id, source_message_id) DO UPDATE SET
        caption_normalized = excluded.caption_normalized,
        caption_original = excluded.caption_original,
        preceding_review_message_id = COALESCE(
          pending_source_posts.preceding_review_message_id,
          excluded.preceding_review_message_id
        )
    `).bind(
      channelId,
      messageId,
      captionNormalized,
      typeof message.caption === "string" ? message.caption.slice(0, 4096) : "",
      previous?.source_message_id ?? null,
      now,
      now + SOURCE_RETENTION_SECONDS
    ).run();
  }

  // If Telegram delivered updates out of order, a late-arriving preceding post
  // can still be attached to the next indexed video post by message_id order.
  if (!isVideo) {
    const next = await db.prepare(`
      SELECT source_message_id, is_video
      FROM source_events
      WHERE source_channel_id = ?
        AND source_message_id > ?
      ORDER BY source_message_id ASC
      LIMIT 1
    `).bind(channelId, messageId).first();

    if (next?.is_video === 1) {
      await db.batch([
        db.prepare(`
          UPDATE source_events
          SET preceding_review_message_id = ?
          WHERE source_channel_id = ? AND source_message_id = ?
        `).bind(messageId, channelId, next.source_message_id),
        db.prepare(`
          UPDATE pending_source_posts
          SET preceding_review_message_id = ?
          WHERE source_channel_id = ? AND source_message_id = ?
        `).bind(messageId, channelId, next.source_message_id)
      ]);
    }
  }
}

export async function createOrGetDownload(db, record, token, now) {
  const existing = await db.prepare(`
    SELECT token, repost_message_id
    FROM downloads
    WHERE store_channel_id = ? AND store_message_id = ?
  `).bind(record.store_channel_id, record.store_message_id).first();

  if (existing) return existing;

  await db.prepare(`
    INSERT INTO downloads (
      token, store_channel_id, store_message_id,
      source_channel_id, source_message_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    token,
    record.store_channel_id,
    record.store_message_id,
    record.source_channel_id,
    record.source_message_id,
    now
  ).run();

  return { token, repost_message_id: null };
}

export async function updateDownloadRepost(db, token, repostMessageId) {
  await db.prepare(`
    UPDATE downloads SET repost_message_id = ? WHERE token = ?
  `).bind(repostMessageId, token).run();
}

export async function deleteDownload(db, token) {
  await db.prepare(`DELETE FROM downloads WHERE token = ?`).bind(token).run();
}

export async function getDownload(db, token) {
  return db.prepare(`
    SELECT token, store_channel_id, store_message_id,
           source_channel_id, source_message_id, created_at, repost_message_id
    FROM downloads WHERE token = ?
  `).bind(token).first();
}

export async function consumePendingSource(db, sourceChannelId, sourceMessageId) {
  await db.prepare(`
    DELETE FROM pending_source_posts
    WHERE source_channel_id = ? AND source_message_id = ?
  `).bind(sourceChannelId, sourceMessageId).run();
}

export async function cleanupDatabase(db, now) {
  const sourceCutoff = now - SOURCE_RETENTION_SECONDS;
  const updateCutoff = now - UPDATE_RETENTION_SECONDS;

  const results = await db.batch([
    db.prepare(`DELETE FROM pending_source_posts WHERE expires_at <= ?`).bind(now),
    db.prepare(`DELETE FROM source_events WHERE created_at <= ?`).bind(sourceCutoff),
    db.prepare(`DELETE FROM processed_store WHERE expires_at <= ?`).bind(now),
    db.prepare(`
      DELETE FROM telegram_updates
      WHERE updated_at <= ? AND (status != 'processing' OR lease_until <= ?)
    `).bind(updateCutoff, now)
  ]);

  return results.reduce((sum, item) => sum + Number(item?.meta?.changes ?? 0), 0);
}

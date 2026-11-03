import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("v2.1 migration creates Store pending index and retryable status", async () => {
  const sql = await readFile(resolve(root, "migrations/0002_production_matching.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS pending_store_videos/i);
  assert.match(sql, /caption_normalized TEXT NOT NULL/i);
  assert.match(sql, /'pending_match'/i);
  assert.match(sql, /idx_pending_store_caption/i);
  assert.match(sql, /'legacy_skipped'/i);
  assert.match(sql, /original caption was not stored/i);
});

test("initial migration defines all persistent operational tables", async () => {
  const sql = await readFile(resolve(root, "migrations/0001_initial_schema.sql"), "utf8");
  for (const table of ["telegram_updates", "source_events", "pending_source_posts", "processed_store", "downloads"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
  }
});

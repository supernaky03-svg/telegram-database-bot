import test from "node:test";
import assert from "node:assert/strict";
import {
  UPDATE_RETENTION_SECONDS,
  STORE_DEDUPE_SECONDS,
  SOURCE_RETENTION_SECONDS,
  LEASE_SECONDS
} from "../src/lib/database.js";

test("production retention windows match the documented policy", () => {
  assert.equal(UPDATE_RETENTION_SECONDS, 72 * 60 * 60);
  assert.equal(STORE_DEDUPE_SECONDS, 72 * 60 * 60);
  assert.equal(SOURCE_RETENTION_SECONDS, 7 * 24 * 60 * 60);
  assert.equal(LEASE_SECONDS, 120);
});

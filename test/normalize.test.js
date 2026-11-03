import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCaption, isVideoPost } from "../src/lib/normalize.js";

test("normalizes whitespace, line endings, invisible chars and case", () => {
  assert.equal(
    normalizeCaption("  ＭＯＶＩＥ\u200B   Name \r\n  Part  1 "),
    "movie name\npart 1"
  );
});

test("does not remove punctuation or use fuzzy matching", () => {
  assert.notEqual(normalizeCaption("Movie: Part 1"), normalizeCaption("Movie Part 1"));
  assert.notEqual(normalizeCaption("Movie 1"), normalizeCaption("Movie 2"));
});

test("recognizes Telegram video and video document posts", () => {
  assert.equal(isVideoPost({ video: { file_id: "x" } }), true);
  assert.equal(isVideoPost({ document: { mime_type: "video/mp4" } }), true);
  assert.equal(isVideoPost({ document: { mime_type: "application/pdf" } }), false);
  assert.equal(isVideoPost({ photo: [{}] }), false);
});

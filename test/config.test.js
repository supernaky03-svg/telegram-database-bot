import test from "node:test";
import assert from "node:assert/strict";
import { getJoinChannels, getChannelIds, getBotUsername } from "../src/lib/config.js";

test("parses required join channels", () => {
  const env = {
    JOIN_CHANNELS_JSON: JSON.stringify([
      { channel_id: "-1001234567890", title: "Updates", link: "https://t.me/+AbCdEf" }
    ])
  };
  assert.deepEqual(getJoinChannels(env), [
    { channel_id: "-1001234567890", title: "Updates", link: "https://t.me/+AbCdEf" }
  ]);
});

test("rejects duplicate and invalid join channels", () => {
  assert.throws(() => getJoinChannels({ JOIN_CHANNELS_JSON: "[]" }), /non-empty/);
  assert.throws(() => getJoinChannels({ JOIN_CHANNELS_JSON: "not-json" }), /valid JSON/);
  assert.throws(() => getJoinChannels({
    JOIN_CHANNELS_JSON: JSON.stringify([
      { channel_id: "-1001234567890", title: "A", link: "https://t.me/a" },
      { channel_id: "-1001234567890", title: "B", link: "https://t.me/b" }
    ])
  }), /duplicate/i);
});

test("validates core channel IDs and bot username", () => {
  assert.deepEqual(
    getChannelIds({
      SOURCE_CHANNEL_ID: "-1001",
      STORE_CHANNEL_ID: "-1002",
      REPOST_CHANNEL_ID: "-1003"
    }),
    { source: "-1001", store: "-1002", repost: "-1003" }
  );
  assert.equal(getBotUsername({ BOT_USERNAME: "@ExampleStoreBot" }), "ExampleStoreBot");
  assert.throws(() => getChannelIds({
    SOURCE_CHANNEL_ID: "-1001",
    STORE_CHANNEL_ID: "-1001",
    REPOST_CHANNEL_ID: "-1003"
  }), /must be different/);
});


test("supports LINK1/LINK2 and CHANNEL_IDn Secret/Var layout", () => {
  const env = {
    LINK1: "https://t.me/+FirstInvite",
    CHANNEL_ID1: "-1001111111111",
    CHANNEL_TITLE1: "News",
    LINK2: "https://t.me/+SecondInvite",
    CHANNEL_ID2: "-1002222222222"
  };
  assert.deepEqual(getJoinChannels(env), [
    { channel_id: "-1001111111111", title: "News", link: "https://t.me/+FirstInvite" },
    { channel_id: "-1002222222222", title: "Required Channel 2", link: "https://t.me/+SecondInvite" }
  ]);
  assert.throws(() => getJoinChannels({
    LINK1: "https://t.me/+FirstInvite"
  }), /LINK1 and CHANNEL_ID1/);
});

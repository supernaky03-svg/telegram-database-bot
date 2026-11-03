import test from "node:test";
import assert from "node:assert/strict";
import {
  getJoinChannels,
  getChannelIds,
  getBotUsername,
  validateEnvironment
} from "../src/lib/config.js";

 test("parses required join channels from numbered Secret bindings", () => {
  const env = {
    JOIN_CHANNEL1_ID: "-1001234567890",
    JOIN_CHANNEL1_LINK: "https://t.me/+AbCdEf",
    JOIN_CHANNEL1_TITLE: "Updates",
    JOIN_CHANNEL2_ID: "-1001234567891",
    JOIN_CHANNEL2_LINK: "https://t.me/secondchannel"
  };
  assert.deepEqual(getJoinChannels(env), [
    { channel_id: "-1001234567890", title: "Updates", link: "https://t.me/+AbCdEf" },
    { channel_id: "-1001234567891", title: "Required Channel 2", link: "https://t.me/secondchannel" }
  ]);
});

test("supports JOIN_CHANNELS_JSON alternative", () => {
  const env = {
    JOIN_CHANNELS_JSON: JSON.stringify([
      { channel_id: "-1001234567890", title: "Updates", link: "https://t.me/+AbCdEf" }
    ])
  };
  assert.deepEqual(getJoinChannels(env), [
    { channel_id: "-1001234567890", title: "Updates", link: "https://t.me/+AbCdEf" }
  ]);
});

test("rejects missing pairs, duplicate IDs, invalid links and invalid JSON", () => {
  assert.throws(() => getJoinChannels({}), /JOIN_CHANNEL1_ID/);
  assert.throws(() => getJoinChannels({
    JOIN_CHANNEL1_ID: "-1001",
    JOIN_CHANNEL1_LINK: "https://t.me/one",
    JOIN_CHANNEL2_ID: "-1001",
    JOIN_CHANNEL2_LINK: "https://t.me/two"
  }), /duplicate/i);
  assert.throws(() => getJoinChannels({
    JOIN_CHANNEL1_ID: "-1001",
    JOIN_CHANNEL1_LINK: "https://example.com/not-telegram"
  }), /https:\/\/t\.me/);
  assert.throws(() => getJoinChannels({ JOIN_CHANNELS_JSON: "not-json" }), /valid JSON/);
  assert.throws(() => getJoinChannels({ JOIN_CHANNELS_JSON: "[]" }), /non-empty/);
});

test("keeps v2.0 channel Secret aliases working during upgrade", () => {
  assert.deepEqual(getJoinChannels({
    LINK1: "https://t.me/+FirstInvite",
    CHANNEL_ID1: "-1001111111111",
    CHANNEL_TITLE1: "News"
  }), [
    { channel_id: "-1001111111111", title: "News", link: "https://t.me/+FirstInvite" }
  ]);
});

test("validates unique core channel IDs and bot username", () => {
  assert.deepEqual(getChannelIds({
    SOURCE_CHANNEL_ID: "-1001",
    STORE_CHANNEL_ID: "-1002",
    REPOST_CHANNEL_ID: "-1003"
  }), { source: "-1001", store: "-1002", repost: "-1003" });
  assert.equal(getBotUsername({ BOT_USERNAME: "@ExampleStoreBot" }), "ExampleStoreBot");
  assert.throws(() => getChannelIds({
    SOURCE_CHANNEL_ID: "-1001",
    STORE_CHANNEL_ID: "-1001",
    REPOST_CHANNEL_ID: "-1003"
  }), /must be different/);
});

test("validates webhook secret format and required bindings", () => {
  const valid = {
    BOT_TOKEN: "123456:example_token",
    TELEGRAM_WEBHOOK_SECRET: "a_random_secret_123",
    BOT_USERNAME: "ExampleStoreBot",
    SOURCE_CHANNEL_ID: "-1001",
    STORE_CHANNEL_ID: "-1002",
    REPOST_CHANNEL_ID: "-1003",
    JOIN_CHANNEL1_ID: "-1004",
    JOIN_CHANNEL1_LINK: "https://t.me/+Invite",
    DB: {},
    DELIVERY_CLEANUP: {}
  };
  assert.doesNotThrow(() => validateEnvironment(valid));
  assert.throws(() => validateEnvironment({ ...valid, TELEGRAM_WEBHOOK_SECRET: "bad secret" }), /TELEGRAM_WEBHOOK_SECRET/);
  assert.throws(() => validateEnvironment({ ...valid, DB: null }), /D1 binding DB/);
});

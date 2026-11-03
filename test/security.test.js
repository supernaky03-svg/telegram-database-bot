import test from "node:test";
import assert from "node:assert/strict";
import {
  createDownloadToken,
  isValidDownloadToken,
  makeStartLink,
  parseStartPayload
} from "../src/lib/security.js";

test("download tokens are random, URL-safe and accepted", () => {
  const a = createDownloadToken();
  const b = createDownloadToken();
  assert.match(a, /^[A-Za-z0-9_-]{20,40}$/);
  assert.equal(isValidDownloadToken(a), true);
  assert.notEqual(a, b);
});

test("start payload parser accepts only dl tokens", () => {
  assert.deepEqual(parseStartPayload("/start"), { type: "home" });
  assert.deepEqual(parseStartPayload("/start@StoreBot"), { type: "home" });
  assert.equal(parseStartPayload("/start dl_short").type, "invalid");
  const token = "abcdefghijklmnopqrstuvwx";
  assert.deepEqual(parseStartPayload(`/start dl_${token}`), { type: "download", token });
  assert.equal(parseStartPayload("/start 123-999").type, "home");
});

test("creates a Bot deep link", () => {
  assert.equal(
    makeStartLink("ExampleStoreBot", "abcdefghijklmnopqrstuvwx"),
    "https://t.me/ExampleStoreBot?start=dl_abcdefghijklmnopqrstuvwx"
  );
});

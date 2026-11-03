const CHAT_ID_PATTERN = /^-?\d+$/;
const MAX_JOIN_CHANNELS = 30;

export function requiredString(env, key) {
  const value = env?.[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required environment value: ${key}`);
  }
  return value.trim();
}

export function getChannelIds(env) {
  const source = requiredString(env, "SOURCE_CHANNEL_ID");
  const store = requiredString(env, "STORE_CHANNEL_ID");
  const repost = requiredString(env, "REPOST_CHANNEL_ID");

  for (const [name, id] of Object.entries({
    SOURCE_CHANNEL_ID: source,
    STORE_CHANNEL_ID: store,
    REPOST_CHANNEL_ID: repost
  })) {
    if (!CHAT_ID_PATTERN.test(id)) {
      throw new Error(`${name} must be a numeric Telegram channel ID`);
    }
  }

  if (source === store || source === repost || store === repost) {
    throw new Error("SOURCE_CHANNEL_ID, STORE_CHANNEL_ID and REPOST_CHANNEL_ID must be different");
  }

  return { source, store, repost };
}

export function getBotUsername(env) {
  const username = requiredString(env, "BOT_USERNAME").replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    throw new Error("BOT_USERNAME is invalid; enter it without @");
  }
  return username;
}

function validateJoinChannel(item, index, seen) {
  const channelId = String(item?.channel_id ?? item?.id ?? "").trim();
  const title = String(item?.title ?? `Required Channel ${index + 1}`).trim();
  const link = String(item?.link ?? "").trim();

  if (!CHAT_ID_PATTERN.test(channelId)) {
    throw new Error(`Join channel ${index + 1}: channel_id must be a numeric Telegram chat ID`);
  }
  if (!title || title.length > 80) {
    throw new Error(`Join channel ${index + 1}: title must be 1-80 characters`);
  }

  let url;
  try {
    url = new URL(link);
  } catch {
    throw new Error(`Join channel ${index + 1}: link is invalid`);
  }
  if (url.protocol !== "https:" || url.hostname !== "t.me" || url.pathname === "/") {
    throw new Error(`Join channel ${index + 1}: link must be a valid https://t.me/ invite or channel URL`);
  }
  if (seen.has(channelId)) {
    throw new Error(`Duplicate join channel_id: ${channelId}`);
  }
  seen.add(channelId);
  return { channel_id: channelId, title, link };
}

export function getJoinChannels(env) {
  const rawJson = typeof env?.JOIN_CHANNELS_JSON === "string"
    ? env.JOIN_CHANNELS_JSON.trim()
    : "";
  let source = [];

  if (rawJson) {
    try {
      source = JSON.parse(rawJson);
    } catch {
      throw new Error("JOIN_CHANNELS_JSON must contain valid JSON");
    }
    if (!Array.isArray(source) || source.length === 0) {
      throw new Error("JOIN_CHANNELS_JSON must be a non-empty JSON array");
    }
  } else {
    for (let index = 1; index <= MAX_JOIN_CHANNELS; index++) {
      const id = String(env?.[`JOIN_CHANNEL${index}_ID`] ?? "").trim();
      const link = String(env?.[`JOIN_CHANNEL${index}_LINK`] ?? "").trim();
      const title = String(
        env?.[`JOIN_CHANNEL${index}_TITLE`] ?? env?.[`CHANNEL_TITLE${index}`] ?? `Required Channel ${index}`
      ).trim();

      // Backward-compatible aliases from v2.0. New deployments should use JOIN_CHANNELn_*.
      const legacyId = String(env?.[`CHANNEL_ID${index}`] ?? "").trim();
      const legacyLink = String(env?.[`LINK${index}`] ?? "").trim();
      const resolvedId = id || legacyId;
      const resolvedLink = link || legacyLink;

      if (!resolvedId && !resolvedLink) continue;
      if (!resolvedId || !resolvedLink) {
        throw new Error(`JOIN_CHANNEL${index}_ID and JOIN_CHANNEL${index}_LINK must both be configured`);
      }
      source.push({ channel_id: resolvedId, title, link: resolvedLink });
    }
    if (source.length === 0) {
      throw new Error("Configure JOIN_CHANNELS_JSON or JOIN_CHANNEL1_ID + JOIN_CHANNEL1_LINK");
    }
  }

  if (source.length > MAX_JOIN_CHANNELS) {
    throw new Error(`Up to ${MAX_JOIN_CHANNELS} required channels are supported`);
  }

  const seen = new Set();
  return source.map((item, index) => validateJoinChannel(item, index, seen));
}

export function validateEnvironment(env) {
  requiredString(env, "BOT_TOKEN");
  const webhookSecret = requiredString(env, "TELEGRAM_WEBHOOK_SECRET");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET must contain only letters, numbers, _ or - (1-256 chars)");
  }
  getBotUsername(env);
  getChannelIds(env);
  getJoinChannels(env);
  if (!env.DB) throw new Error("D1 binding DB is missing");
  if (!env.DELIVERY_CLEANUP) throw new Error("Durable Object binding DELIVERY_CLEANUP is missing");
}

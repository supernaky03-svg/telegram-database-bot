const CHAT_ID_PATTERN = /^-?\d+$/;

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

export function getJoinChannels(env) {
  let value = null;
  const raw = typeof env?.JOIN_CHANNELS_JSON === "string"
    ? env.JOIN_CHANNELS_JSON.trim()
    : "";

  if (raw) {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error("JOIN_CHANNELS_JSON must contain valid JSON");
    }
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error("JOIN_CHANNELS_JSON must be a non-empty JSON array");
    }
  } else {
    // Preferred secret layout for users who want one Cloudflare Secret per link:
    // LINK1 + CHANNEL_ID1 (+ optional CHANNEL_TITLE1), LINK2 + CHANNEL_ID2, ...
    value = [];
    for (let index = 1; index <= 30; index++) {
      const link = String(env?.[`LINK${index}`] ?? "").trim();
      const channelId = String(env?.[`CHANNEL_ID${index}`] ?? "").trim();
      const title = String(env?.[`CHANNEL_TITLE${index}`] ?? `Required Channel ${index}`).trim();

      if (!link && !channelId) continue;
      if (!link || !channelId) {
        throw new Error(`LINK${index} and CHANNEL_ID${index} must both be configured`);
      }
      value.push({ channel_id: channelId, title, link });
    }
    if (value.length === 0) {
      throw new Error("Configure JOIN_CHANNELS_JSON or at least LINK1 + CHANNEL_ID1");
    }
  }

  if (value.length > 30) {
    throw new Error("Up to 30 required channels are supported");
  }

  const seen = new Set();
  return value.map((item, index) => {
    const channelId = String(item?.channel_id ?? "").trim();
    const title = String(item?.title ?? `Channel ${index + 1}`).trim();
    const link = String(item?.link ?? "").trim();

    if (!CHAT_ID_PATTERN.test(channelId)) {
      throw new Error(`Join channel ${index + 1}: channel_id must be numeric`);
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
    if (url.protocol !== "https:" || url.hostname !== "t.me") {
      throw new Error(`Join channel ${index + 1}: link must be an https://t.me/ URL`);
    }
    if (seen.has(channelId)) {
      throw new Error(`Duplicate join channel_id: ${channelId}`);
    }
    seen.add(channelId);
    return { channel_id: channelId, title, link };
  });
}

export function validateEnvironment(env) {
  requiredString(env, "BOT_TOKEN");
  requiredString(env, "TELEGRAM_WEBHOOK_SECRET");
  getBotUsername(env);
  getChannelIds(env);
  getJoinChannels(env);
  if (!env.DB) throw new Error("D1 binding DB is missing");
  if (!env.DELIVERY_CLEANUP) throw new Error("Durable Object binding DELIVERY_CLEANUP is missing");
}

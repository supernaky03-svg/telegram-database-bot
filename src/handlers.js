import { normalizeCaption, isVideoPost } from "./lib/normalize.js";
import {
  getBotUsername,
  getChannelIds,
  getJoinChannels
} from "./lib/config.js";
import {
  createDownloadToken,
  isValidDownloadToken,
  makeStartLink,
  parseStartPayload
} from "./lib/security.js";
import {
  claimStorePost,
  finishStorePost,
  findLatestSourceMatch,
  recordSourcePost,
  createOrGetDownload,
  updateDownloadRepost,
  getDownload,
  consumePendingSource
} from "./lib/database.js";
import { telegram, safeDeleteMessage } from "./lib/telegram.js";

const DOWNLOAD_TTL_MS = 3 * 60 * 60 * 1000;

function isJoined(member) {
  if (!member || typeof member !== "object") return false;
  if (["creator", "administrator", "member"].includes(member.status)) return true;
  return member.status === "restricted" && member.is_member === true;
}

async function checkMembership(userId, env) {
  const channels = getJoinChannels(env);
  const results = await Promise.all(channels.map(async channel => {
    try {
      const member = await telegram(env, "getChatMember", {
        chat_id: channel.channel_id,
        user_id: userId
      });
      return { channel, joined: isJoined(member), error: null };
    } catch (error) {
      console.error("getChatMember failed", {
        channel_id: channel.channel_id,
        error: String(error?.message || error)
      });
      return { channel, joined: false, error };
    }
  }));

  return {
    missing: results.filter(item => !item.joined && !item.error).map(item => item.channel),
    unknown: results.filter(item => item.error).map(item => item.channel),
    allJoined: results.every(item => item.joined)
  };
}

function buildJoinKeyboard(membership, payload) {
  const rows = [];
  for (const channel of [...membership.missing, ...membership.unknown]) {
    rows.push([{
      text: `📢 ${channel.title}`,
      url: channel.link
    }]);
  }
  const callbackValue = payload ? `jc_${payload}` : "jc_home";
  rows.push([{
    text: "✅ Joined — Check Again",
    callback_data: callbackValue.slice(0, 64)
  }]);
  return { inline_keyboard: rows };
}

async function sendJoinGate(chatId, userId, env, payload = null) {
  const membership = await checkMembership(userId, env);

  if (membership.allJoined) return membership;

  const keyboard = buildJoinKeyboard(membership, payload);
  let text;

  if (membership.unknown.length > 0) {
    text =
      "⚠️ Channel membership ကို လောလောဆယ် အတည်မပြုနိုင်သေးပါ။\n\n" +
      "Bot ကို သက်ဆိုင်ရာ Channel များတွင် Administrator အဖြစ် ထည့်ထားကြောင်း စစ်ဆေးပြီးနောက် Check Again ကို နှိပ်ပါ။";
  } else {
    text =
      "🔒 Bot ကို အသုံးပြုရန် အောက်ပါ Channel များကို Join လုပ်ထားရန် လိုအပ်ပါသည်။\n\n" +
      "Join မလုပ်ရသေးသော Channel များကိုသာ ပြထားပါတယ်။ Join ပြီးလျှင် Check Again ကို နှိပ်ပါ။";
  }

  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: keyboard,
    disable_web_page_preview: true
  });
  return membership;
}

async function sendWelcome(chatId, env) {
  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text:
      "မင်္ဂလာပါ။ ✅ Channel membership အတည်ပြုပြီးပါပြီ။\n\n" +
      "Movie Review post ထဲက 📥 Download ခလုတ်ကို နှိပ်ပြီး Video ကို ရယူနိုင်ပါတယ်။"
  });
}

async function deliverDownload(userId, token, env) {
  if (!isValidDownloadToken(token)) {
    await telegram(env, "sendMessage", {
      chat_id: userId,
      text: "❌ Download link မမှန်ကန်ပါ။ Review Channel မှ Download ခလုတ်ကို ပြန်နှိပ်ပါ။"
    });
    return;
  }

  const membership = await checkMembership(userId, env);
  if (!membership.allJoined) {
    await sendJoinGate(userId, userId, env, `dl_${token}`);
    return;
  }

  const mapping = await getDownload(env.DB, token);
  if (!mapping) {
    await telegram(env, "sendMessage", {
      chat_id: userId,
      text: "❌ ဒီ Download link ကို ရှာမတွေ့တော့ပါ။ Channel ထဲက Download ခလုတ်ကို ပြန်အသုံးပြုပါ။"
    });
    return;
  }

  let copied;
  try {
    copied = await telegram(env, "copyMessage", {
      chat_id: userId,
      from_chat_id: mapping.store_channel_id,
      message_id: mapping.store_message_id
    });
  } catch (error) {
    console.error("File copy failed", {
      store_message_id: mapping.store_message_id,
      error: String(error?.message || error)
    });
    await telegram(env, "sendMessage", {
      chat_id: userId,
      text: "❌ ဖိုင်ကို ယခုအချိန်တွင် ပို့မရပါ။ Store Channel ထဲရှိ မူရင်းဖိုင်ကို စစ်ဆေးရန် လိုအပ်နိုင်ပါတယ်။"
    });
    return;
  }

  let warningMessageId = null;
  try {
    const warning = await telegram(env, "sendMessage", {
      chat_id: userId,
      text:
        "⚠️ သတိပေးချက်\n\n" +
        "ဒီ Video ကို ပို့ပြီးနောက် ၃ နာရီပြည့်လျှင် Bot Chat ထဲမှ အလိုအလျောက် ဖျက်ပါမည်။\n" +
        "အမြဲတမ်းသိမ်းထားလိုပါက ဖျက်မသွားမီ Saved Messages ထဲသို့ Save သို့မဟုတ် Forward လုပ်ထားပါ။"
    });
    warningMessageId = warning.message_id;
  } catch (error) {
    console.error("Delivery warning could not be sent", String(error?.message || error));
  }

  const job = {
    job_id: crypto.randomUUID(),
    chat_id: String(userId),
    video_message_id: Number(copied.message_id),
    warning_message_id: warningMessageId,
    token,
    delete_at: Date.now() + DOWNLOAD_TTL_MS
  };

  try {
    const id = env.DELIVERY_CLEANUP.idFromName("global-delivery-cleanup");
    const stub = env.DELIVERY_CLEANUP.get(id);
    const response = await stub.fetch("https://do.internal/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(job)
    });
    if (!response.ok) throw new Error(`Delivery cleanup queue returned ${response.status}`);
  } catch (error) {
    await safeDeleteMessage(env, userId, copied.message_id).catch(() => {});
    await safeDeleteMessage(env, userId, warningMessageId).catch(() => {});
    console.error("Could not schedule 3-hour deletion", String(error?.message || error));
    await telegram(env, "sendMessage", {
      chat_id: userId,
      text: "⚠️ Auto-delete စနစ်ကို မစီစဉ်နိုင်ခဲ့သဖြင့် ဖိုင်ကို လုံခြုံရေးအတွက် ပြန်ဖျက်လိုက်ပါတယ်။ နောက်တစ်ကြိမ် ပြန်စမ်းကြည့်ပါ။"
    });
  }
}

async function handlePrivateMessage(message, env) {
  if (!message?.chat || message.chat.type !== "private" || !message.from) return;
  const text = message.text ?? "";

  if (text.startsWith("/start")) {
    const payload = parseStartPayload(text);
    if (!payload || payload.type === "invalid") {
      await telegram(env, "sendMessage", {
        chat_id: message.chat.id,
        text: "❌ Start link မမှန်ကန်ပါ။ Channel ထဲက Download ခလုတ်ကို ပြန်နှိပ်ပါ။"
      });
      return;
    }

    if (payload.type === "download") {
      await deliverDownload(message.from.id, payload.token, env);
      return;
    }

    const membership = await sendJoinGate(message.chat.id, message.from.id, env);
    if (membership.allJoined) await sendWelcome(message.chat.id, env);
    return;
  }

  if (text.startsWith("/help")) {
    await telegram(env, "sendMessage", {
      chat_id: message.chat.id,
      text: "အသုံးပြုရန် — သက်ဆိုင်ရာ Review Channel post ထဲက 📥 Download ခလုတ်ကို နှိပ်ပါ။ Channel Join လိုအပ်ပါက Bot က ပြပေးပါမည်။"
    });
  }
}

async function handleJoinCheck(callback, env) {
  const userId = callback.from?.id;
  const raw = String(callback.data || "");
  const value = raw.slice(3);
  const token = value.startsWith("dl_") ? value.slice(3) : null;

  await telegram(env, "answerCallbackQuery", {
    callback_query_id: callback.id,
    text: "Membership စစ်ဆေးနေပါတယ်..."
  });

  if (token && !isValidDownloadToken(token)) {
    await telegram(env, "sendMessage", {
      chat_id: userId,
      text: "❌ Download link မမှန်ကန်ပါ။"
    });
    return;
  }

  if (token) {
    await deliverDownload(userId, token, env);
    return;
  }

  const membership = await sendJoinGate(userId, userId, env);
  if (membership.allJoined) await sendWelcome(userId, env);
}

async function handleCallback(callback, env) {
  const data = String(callback?.data || "");
  if (data.startsWith("jc_")) {
    await handleJoinCheck(callback, env);
    return;
  }
  await telegram(env, "answerCallbackQuery", {
    callback_query_id: callback.id,
    text: "ခလုတ်ကို နားမလည်ပါ။"
  });
}

async function handleSourcePost(message, sourceChannelId, env) {
  const video = isVideoPost(message);
  const caption = typeof message.caption === "string" ? message.caption : "";
  const normalized = video ? normalizeCaption(caption) : "";

  await recordSourcePost(
    env.DB,
    sourceChannelId,
    message,
    Math.floor(Date.now() / 1000),
    normalized,
    video
  );
}

async function handleStorePost(message, storeChannelId, sourceChannelId, repostChannelId, env) {
  if (!isVideoPost(message)) return;

  const normalized = normalizeCaption(typeof message.caption === "string" ? message.caption : "");
  if (!normalized) {
    console.log("Store video skipped: empty caption", message.message_id);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const storeMessageId = Number(message.message_id);
  const claim = await claimStorePost(env.DB, storeChannelId, storeMessageId, now);
  if (!claim.claimed) {
    if (claim.busy) throw new Error(`Store post ${storeMessageId} is already being processed; retry`);
    console.log("Duplicate Store post ignored", storeMessageId);
    return;
  }

  let mapping = null;
  try {
    const source = await findLatestSourceMatch(env.DB, sourceChannelId, normalized, now);

    if (!source) {
      await finishStorePost(env.DB, storeChannelId, storeMessageId, {
        status: "skipped_no_match"
      }, now);
      console.log("Store post skipped: no caption match", storeMessageId);
      return;
    }

    if (!source.preceding_review_message_id) {
      await finishStorePost(env.DB, storeChannelId, storeMessageId, {
        status: "skipped_no_review",
        errorText: "Latest matching Source video has no indexed preceding post"
      }, now);
      console.log("Store post skipped: latest matching Source video has no preceding review", {
        storeMessageId,
        sourceMessageId: source.source_message_id
      });
      return;
    }

    const token = createDownloadToken();
    mapping = await createOrGetDownload(env.DB, {
      store_channel_id: storeChannelId,
      store_message_id: storeMessageId,
      source_channel_id: sourceChannelId,
      source_message_id: source.source_message_id
    }, token, now);

    // If the same Store message was already successfully reposted, do not send again.
    if (mapping.repost_message_id) {
      await finishStorePost(env.DB, storeChannelId, storeMessageId, {
        status: "success",
        repostMessageId: mapping.repost_message_id,
        downloadToken: mapping.token
      }, now);
      await consumePendingSource(env.DB, sourceChannelId, source.source_message_id);
      return;
    }

    const botUsername = getBotUsername(env);
    const startLink = makeStartLink(botUsername, mapping.token);
    const reposted = await telegram(env, "copyMessage", {
      chat_id: repostChannelId,
      from_chat_id: sourceChannelId,
      message_id: Number(source.preceding_review_message_id),
      reply_markup: {
        inline_keyboard: [[{
          text: "📥 Download",
          url: startLink
        }]]
      }
    });

    await updateDownloadRepost(env.DB, mapping.token, reposted.message_id);
    await finishStorePost(env.DB, storeChannelId, storeMessageId, {
      status: "success",
      repostMessageId: reposted.message_id,
      downloadToken: mapping.token
    }, Math.floor(Date.now() / 1000));

    await consumePendingSource(env.DB, sourceChannelId, source.source_message_id);

    console.log("Review reposted", {
      storeMessageId,
      sourceVideoMessageId: source.source_message_id,
      reviewMessageId: source.preceding_review_message_id,
      repostMessageId: reposted.message_id
    });
  } catch (error) {
    await finishStorePost(env.DB, storeChannelId, storeMessageId, {
      status: "failed",
      downloadToken: mapping?.token ?? null,
      errorText: error?.message || error
    }, Math.floor(Date.now() / 1000)).catch(() => {});
    throw error;
  }
}

export async function handleTelegramUpdate(update, env) {
  const channelIds = getChannelIds(env);

  if (update?.message) {
    await handlePrivateMessage(update.message, env);
    return;
  }
  if (update?.callback_query) {
    await handleCallback(update.callback_query, env);
    return;
  }
  if (update?.channel_post) {
    const message = update.channel_post;
    const chatId = String(message.chat?.id ?? "");
    if (chatId === channelIds.source) {
      await handleSourcePost(message, channelIds.source, env);
    } else if (chatId === channelIds.store) {
      await handleStorePost(
        message,
        channelIds.store,
        channelIds.source,
        channelIds.repost,
        env
      );
    }
  }
}

export async function sendDownloadStartHelp(chatId, env) {
  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text: "Movie Review Channel ထဲက Download ခလုတ်ကို နှိပ်ပြီး Bot ကို Start လုပ်ပါ။"
  });
}

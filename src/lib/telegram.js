export class TelegramApiError extends Error {
  constructor(method, payload) {
    super(payload?.description || `Telegram API ${method} failed`);
    this.name = "TelegramApiError";
    this.method = method;
    this.errorCode = payload?.error_code ?? 0;
    this.parameters = payload?.parameters ?? null;
  }
}

export async function telegram(env, method, body) {
  if (!env?.BOT_TOKEN) throw new Error("BOT_TOKEN is not configured");

  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Telegram API ${method} returned a non-JSON response`);
  }

  if (!response.ok || payload?.ok !== true) {
    throw new TelegramApiError(method, payload);
  }
  return payload.result;
}

export async function safeDeleteMessage(env, chatId, messageId) {
  if (!messageId) return;
  try {
    await telegram(env, "deleteMessage", {
      chat_id: chatId,
      message_id: Number(messageId)
    });
  } catch (error) {
    const description = String(error?.message || "").toLowerCase();
    if (
      error?.errorCode === 400 &&
      (description.includes("message to delete not found") ||
       description.includes("message identifier is not specified"))
    ) {
      return;
    }
    throw error;
  }
}

export function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

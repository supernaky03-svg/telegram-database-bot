import { claimTelegramUpdate, finishTelegramUpdate, cleanupDatabase } from "./lib/database.js";
import { validateEnvironment } from "./lib/config.js";
import { jsonResponse } from "./lib/telegram.js";
import { handleTelegramUpdate } from "./handlers.js";
export { DeliveryCleanup } from "./delivery-cleanup.js";

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      let configOk = true;
      let error = null;
      try {
        validateEnvironment(env);
      } catch (caught) {
        configOk = false;
        error = caught.message;
      }
      return jsonResponse({
        ok: configOk,
        service: "telegram-file-store-bot",
        version: "2.0.0",
        database: Boolean(env.DB),
        deliveryCleanup: Boolean(env.DELIVERY_CLEANUP),
        configError: error
      }, configOk ? 200 : 503);
    }

    if (url.pathname !== "/telegram/webhook") {
      return new Response("Not Found", { status: 404 });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
    const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    if (!expectedSecret || !constantTimeEqual(suppliedSecret, expectedSecret)) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!env.DB) return new Response("Database binding unavailable", { status: 503 });

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    let claimed = false;

    try {
      const claimState = await claimTelegramUpdate(env.DB, Number(update.update_id), now);
      if (claimState === "done") return new Response("OK", { status: 200 });
      if (claimState === "busy") return new Response("Update is being processed; retry later", { status: 503 });
      claimed = claimState === "claimed";

      await handleTelegramUpdate(update, env);
      await finishTelegramUpdate(env.DB, Number(update.update_id), true, Math.floor(Date.now() / 1000));
      return new Response("OK", { status: 200 });
    } catch (error) {
      if (claimed) {
        await finishTelegramUpdate(
          env.DB,
          Number(update?.update_id),
          false,
          Math.floor(Date.now() / 1000)
        ).catch(() => {});
      }
      console.error("Webhook processing failed", {
        updateId: update?.update_id,
        error: String(error?.message || error)
      });
      return new Response("Temporary processing error", { status: 500 });
    }
  },

  async scheduled(controller, env, ctx) {
    if (!env.DB) {
      console.error("Scheduled cleanup skipped: DB binding missing");
      return;
    }
    try {
      const removed = await cleanupDatabase(env.DB, Math.floor(Date.now() / 1000));
      console.log("Retention cleanup completed", { removedRows: removed });
    } catch (error) {
      console.error("Retention cleanup failed", String(error?.message || error));
      throw error;
    }
  }
};

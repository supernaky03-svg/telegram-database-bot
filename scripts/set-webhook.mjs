import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = createInterface({ input, output });

try {
  const token = (await rl.question("Telegram BOT_TOKEN: ")).trim();
  const workerUrl = (await rl.question("Worker URL (https://...workers.dev): ")).trim().replace(/\/+$/, "");
  const secret = (await rl.question("TELEGRAM_WEBHOOK_SECRET: ")).trim();

  if (!token || !workerUrl || !secret) {
    throw new Error("BOT_TOKEN, Worker URL and webhook secret are required");
  }
  if (!/^https:\/\/.+/.test(workerUrl)) {
    throw new Error("Worker URL must start with https://");
  }
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error("Webhook secret may contain only A-Z, a-z, 0-9, _ and - (1-256 chars)");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: `${workerUrl}/telegram/webhook`,
      secret_token: secret,
      max_connections: 1,
      allowed_updates: ["message", "channel_post", "callback_query"],
      drop_pending_updates: false
    })
  });

  const payload = await response.json();
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.description || `setWebhook failed (${response.status})`);
  }

  console.log("✅ Telegram webhook configured successfully.");
  console.log(`Webhook endpoint: ${workerUrl}/telegram/webhook`);
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
}

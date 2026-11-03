import { telegram, safeDeleteMessage } from "./lib/telegram.js";
import { getBotUsername } from "./lib/config.js";
import { makeStartLink } from "./lib/security.js";

const JOB_PREFIX = "delivery:";
const RETRY_MS = 60 * 1000;

export class DeliveryCleanup {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.storage = ctx.storage;
  }

  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/schedule") {
      return new Response("Not Found", { status: 404 });
    }

    let job;
    try {
      job = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (
      typeof job?.job_id !== "string" ||
      !/^[a-f0-9-]{20,50}$/i.test(job.job_id) ||
      !/^-?\d+$/.test(String(job.chat_id)) ||
      !Number.isSafeInteger(Number(job.video_message_id)) ||
      !Number.isFinite(Number(job.delete_at)) ||
      typeof job.token !== "string" ||
      !/^[A-Za-z0-9_-]{20,40}$/.test(job.token)
    ) {
      return new Response("Invalid cleanup job", { status: 400 });
    }

    const key = `${JOB_PREFIX}${job.job_id}`;
    await this.storage.put(key, {
      job_id: job.job_id,
      chat_id: String(job.chat_id),
      video_message_id: Number(job.video_message_id),
      warning_message_id: job.warning_message_id ? Number(job.warning_message_id) : null,
      token: job.token,
      delete_at: Number(job.delete_at),
      attempts: 0
    });

    await this.reschedule();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" }
    });
  }

  async reschedule() {
    const jobs = await this.storage.list({ prefix: JOB_PREFIX });
    let earliest = null;
    for (const job of jobs.values()) {
      if (earliest === null || job.delete_at < earliest) earliest = job.delete_at;
    }

    if (earliest === null) {
      await this.storage.deleteAlarm();
    } else {
      await this.storage.setAlarm(Math.max(Date.now() + 1000, earliest));
    }
  }

  async alarm() {
    const now = Date.now();
    const jobs = await this.storage.list({ prefix: JOB_PREFIX });
    const ordered = [...jobs.entries()].sort((a, b) => a[1].delete_at - b[1].delete_at);

    for (const [key, job] of ordered) {
      if (job.delete_at > now) continue;

      try {
        await safeDeleteMessage(this.env, job.chat_id, job.video_message_id);
        await safeDeleteMessage(this.env, job.chat_id, job.warning_message_id);

        const username = getBotUsername(this.env);
        const link = makeStartLink(username, job.token);

        await telegram(this.env, "sendMessage", {
          chat_id: job.chat_id,
          text:
            "🗑️ ဖိုင်ကို ၃ နာရီပြည့်သဖြင့် Bot Chat မှ အလိုအလျောက် ဖျက်ပြီးပါပြီ။\n\n" +
            "ပြန်လည်ရယူလိုပါက အောက်ပါခလုတ်ကို နှိပ်ပါ။",
          reply_markup: {
            inline_keyboard: [[{
              text: "📥 Get File Again",
              url: link
            }]]
          }
        });

        await this.storage.delete(key);
      } catch (error) {
        console.error("Delivery cleanup job will retry", {
          jobId: job.job_id,
          error: String(error?.message || error)
        });
        await this.storage.put(key, {
          ...job,
          attempts: Number(job.attempts || 0) + 1,
          delete_at: Date.now() + RETRY_MS
        });
      }
    }

    await this.reschedule();
  }
}

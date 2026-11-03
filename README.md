# Telegram File Store Bot — Cloudflare Production Candidate v2.1.0

Cloudflare Workers + D1 + SQLite-backed Durable Object ကိုအသုံးပြုထားသော Telegram File Store Bot ဖြစ်သည်။ Worker သည် Telegram webhook ကိုလက်ခံပြီး Source Channel မှ Review post ကို Store Channel video caption ဖြင့် match လုပ်ကာ Repost Channel သို့ Download ခလုတ်နှင့်အတူ copy လုပ်ပေးသည်။

> **Production သတိပြုရန်:** source code tests နှင့် SQLite migration simulation ကိုစစ်ဆေးထားသည်။ သင့် Cloudflare account၊ D1 database၊ Telegram bot/channel permissions များနှင့် live end-to-end deployment ကို ဒီ project ထုတ်လုပ်ချိန်တွင် မစမ်းသပ်ရသေးပါ။ Production စတင်အသုံးမပြုမီ အောက်ပါ deployment checklist ကို ပြီးမြောက်စေရမည်။

## 1. v2.1.0 တွင် ပြင်ဆင်ထားသည့်အချက်များ

- **Store-first / Source-first matching:** Store video အရင်ရောက်လည်း ၇ ရက် Pending ထားပြီး နောက်မှ Source matching video ရောက်လာလျှင် ပြန်စစ်သည်။ Source video အရင်ရောက်ပြီး Store video နောက်မှရောက်လည်း ချက်ချင်း match လုပ်သည်။
- **Latest Source video rule:** Caption တူညီသော Source video များစွာရှိလျှင် Telegram `message_id` အကြီးဆုံးဖြစ်သော နောက်ဆုံး video ကိုသာ ရွေးသည်။ အဲဒီ latest video အတွက် preceding Review post မရှိလျှင် အဟောင်း video ၏ Review သို့ fallback မလုပ်ဘဲ Pending ထားသည်။
- **Delayed/out-of-order Source events:** နောက်မှရောက်လာသော ပိုနီးစပ်သည့် preceding Source post ကို သိမ်းဆည်းပြီး Pending Store matching ကို ထပ်မံလုပ်သည်။
- **Scheduled recovery:** ၅ မိနစ်တစ်ကြိမ် cron ဖြင့် match ရှိလာပြီးသား Pending Store jobs နှင့် transient failures များကို ပြန်စစ်သည်။
- **Deploy-time D1 migrations:** `npm run deploy` သည် `wrangler d1 migrations apply DB --remote` ပြီးမှ `wrangler deploy` ကိုလုပ်သည်။ Migration အသစ်ရှိလျှင် table/index များကို deploy အတွင်း အလိုအလျောက်တည်ဆောက်/ပြောင်းလဲပေးသည်။ D1 database resource ကို ပထမတစ်ကြိမ်သာ သီးခြားဖန်တီးထားရန်လိုသည်။
- **Secret-based configuration:** Core channel IDs နှင့် Join Channel IDs/links များကို Worker runtime Secrets မှဖတ်သည်။ Repository ထဲတွင် channel IDs မထည့်ထားတော့ပါ။
- **Duplicate protection & retry:** Telegram update ၇၂ နာရီ၊ Store post ၇၂ နာရီ၊ processing lease ၁၂၀ စက္ကန့်၊ retryable failed records ပါဝင်သည်။
- **3-hour delivery cleanup:** Durable Object Alarm ဖြင့် user ထံပို့ထားသော video နှင့် warning ကို ၃ နာရီပြည့်လျှင် ဖျက်သည်။ Telegram API/Cloudflare အခက်အခဲရှိလျှင် cleanup ကို retry လုပ်သည်။
- **Join verification:** Bot ကိုအသုံးပြုချိန်နှင့် download တစ်ကြိမ်စီတွင် Required Join Channel အားလုံးကို ထပ်စစ်သည်။ User က Channel တစ်ခုခုမှ ထွက်သွားလျှင် Download မပေးပါ။
- ယခင် `🎬 Movies`, `📺 Series`, `🔥 Ongoing`, `💃 Bollywood` reply menu buttons မပါဝင်ပါ။

## 2. Architecture

```text
Telegram Source Channel ─┐
                         ├─> Cloudflare Worker webhook ─> D1
Telegram Store Channel ──┘               │                 │
                                         │                 ├─ Source event index
                                         │                 ├─ Pending Store queue
                                         │                 ├─ Duplicate / lease records
                                         │                 └─ Download token mapping
                                         │
                                         ├─ copy Review post to Repost Channel
                                         └─ Durable Object Alarm
                                                └─ delete delivered video after 3 hours
```

Resources:

- **Worker:** `telegram-file-store-bot`
- **D1 binding:** `DB`
- **D1 database name:** `telegram-file-store-bot-db`
- **Durable Object binding:** `DELIVERY_CLEANUP`
- **Durable Object class:** `DeliveryCleanup` (SQLite-backed)
- **Webhook route:** `/telegram/webhook`
- **Health route:** `/health`

`wrangler.jsonc` တွင် လက်ရှိ repository ကအသုံးပြုနေသော D1 database ID ကို ထည့်ထားသည်။ တခြား Cloudflare account/database ကိုသုံးမည်ဆိုလျှင် `database_id` ကို သင့် D1 database UUID ဖြင့် အစားထိုးပါ။

## 3. Deploy လုပ်တာနဲ့ D1 tables auto-create ဖြစ်စေရန်

Cloudflare Workers Builds ဖြင့် Git repository ချိတ်ထားပါက Dashboard တွင်:

1. **Workers & Pages → telegram-file-store-bot → Settings → Build** သို့ဝင်ပါ။
2. **Build command:** `npm run check`
3. **Deploy command:** `npm run deploy`
4. **Root directory:** `/` (မသတ်မှတ်ထားလျှင် repository root)
5. Git branch ကို `main` သတ်မှတ်ပါ။ Preview builds ကို separate Preview D1 database/config မပြင်ဆင်မချင်း ပိတ်ထားပါ။

`npm run deploy` သည် အောက်ပါအဆင့်နှစ်ခုကို အစဉ်လိုက်လုပ်ဆောင်သည်:

```bash
npm run db:migrate:remote
wrangler deploy
```

### အရေးကြီး — Workers Builds API Token permission

Workers Builds က အလိုအလျောက်ဖန်တီးပေးသော default token တွင် Workers Scripts Edit ပါသော်လည်း D1 permission မပါဝင်နိုင်ပါ။ ဒီ project ရဲ့ `npm run deploy` က remote D1 migration ကိုတိုက်ရိုက် run လုပ်သောကြောင့် Build အသုံးပြုမည့် API token မှာ **D1 → Edit** permission မဖြစ်မနေပါရမည်။ မပါလျှင် migration အဆင့်မှာရပ်ပြီး Worker deploy မဆက်လုပ်ပါ။

Cloudflare Dashboard မှ **My Profile → API Tokens** သို့ဝင်ပြီး Workers deployment အတွက်လိုအပ်သော permission နှင့် **Account → D1 → Edit** ကိုပါခွင့်ပြုထားသော User API Token တစ်ခုကိုရွေး/ပြင်ဆင်ပါ။ ထို token ကို **Workers & Pages → telegram-file-store-bot → Settings → Build → API token** တွင်သတ်မှတ်ပါ။ Token အပြည့်အစုံကို GitHub၊ chat သို့မဟုတ် README ထဲ မထည့်ပါနှင့်။ Workers Builds ၏ default token permissions နှင့် API token permissions အကြောင်း Cloudflare docs ကိုကြည့်ပါ။

`wrangler d1 migrations apply` သည် မလျှောက်ရသေးသော migration များကိုသာ apply လုပ်သဖြင့် deploy တစ်ကြိမ်စီတွင် table အသစ်တွေကို ထပ်ခါတလဲလဲ create မလုပ်ပါ။ Cloudflare Workers Builds တွင် Deploy command ကို `package.json` script တစ်ခုသို့ သတ်မှတ်နိုင်သည်။

> D1 database resource ကို Cloudflare account အတွင်း ပထမဆုံးတစ်ကြိမ် create လုပ်ထားရမည်။ Table/index creation နှင့် schema updates များကိုသာ deploy command က auto-run လုပ်ပေးသည်။ D1 resource မရှိသေးပါက `npm run db:create` ကိုတစ်ကြိမ် run လုပ်ပြီး ထွက်လာသည့် database UUID ကို `wrangler.jsonc` ထဲထည့်ပါ။

## 4. Cloudflare Runtime Secrets / Variables

Cloudflare Dashboard → Worker → **Settings → Variables & Secrets** မှာ **Production** environment အတွက် ထည့်ပါ။ Key များသည် case-sensitive ဖြစ်သည်။

### မဖြစ်မနေထည့်ရမည့် Secrets

| Secret name | Value |
|---|---|
| `BOT_TOKEN` | BotFather ထံမှ Telegram Bot Token |
| `TELEGRAM_WEBHOOK_SECRET` | Random letters/numbers/underscore/dash ပါသော secret string (1–256 chars) |
| `SOURCE_CHANNEL_ID` | Source Channel numeric ID (`-100...`) |
| `STORE_CHANNEL_ID` | Store Channel numeric ID (`-100...`) |
| `REPOST_CHANNEL_ID` | Repost Channel numeric ID (`-100...`) |
| `JOIN_CHANNEL1_ID` | ပထမ Join Channel numeric ID |
| `JOIN_CHANNEL1_LINK` | User Join လုပ်ရန် `https://t.me/...` invite/channel link |

### Join Channel ထပ်ထည့်ရန်

`JOIN_CHANNEL2_ID`, `JOIN_CHANNEL2_LINK`, `JOIN_CHANNEL2_TITLE` အဖြစ် ဆက်ထည့်ပါ။ အများဆုံး 30 channels အထိ support လုပ်သည်။ `TITLE` သည် optional ဖြစ်ပြီး မထည့်လျှင် `Required Channel n` ကို သုံးမည်။

```text
JOIN_CHANNEL1_ID
JOIN_CHANNEL1_LINK
JOIN_CHANNEL1_TITLE
JOIN_CHANNEL2_ID
JOIN_CHANNEL2_LINK
JOIN_CHANNEL2_TITLE
...
JOIN_CHANNEL30_ID
JOIN_CHANNEL30_LINK
JOIN_CHANNEL30_TITLE
```

`JOIN_CHANNELS_JSON` Secret တစ်ခုတည်းဖြင့်လည်း configure လုပ်နိုင်သည် (အဲဒီအခါ `JOIN_CHANNELn_*` keys မလိုပါ):

```json
[
  {
    "channel_id": "-1001111111111",
    "title": "News Channel",
    "link": "https://t.me/+INVITE_CODE"
  },
  {
    "channel_id": "-1002222222222",
    "title": "Movie Updates",
    "link": "https://t.me/movie_updates"
  }
]
```

`BOT_USERNAME` ကို Secret အဖြစ်မလိုပါ။ လက်ရှိ `wrangler.jsonc` တွင် Worker Variable အဖြစ် `Team_Cipher_Bot` သတ်မှတ်ထားသည်။ အခြား bot သုံးမည်ဆိုလျှင် ပြောင်းပါ။

**မှတ်ချက်:** Channel IDs နှင့် invite links များသည် Bot Token လို cryptographic secrets မဟုတ်သော်လည်း သင်ရွေးချယ်ထားသည့်အတိုင်း Cloudflare Secrets ထဲတွင်ထားနိုင်သည်။ `BOT_TOKEN` နှင့် `TELEGRAM_WEBHOOK_SECRET` ကိုတော့ Secret အဖြစ်သာထားပါ။

## 5. Telegram Channel permissions

Bot ကို သက်ဆိုင်ရာ Channel များတွင် Admin ထည့်ပါ။

| Channel role | Bot permission |
|---|---|
| Source Channel | Admin ဖြစ်ရမည်၊ `channel_post` updates ရရှိရန် |
| Store Channel | Admin ဖြစ်ရမည်၊ new video posts ရရှိပြီး `copyMessage` လုပ်နိုင်ရန် |
| Repost Channel | Admin ဖြစ်ရမည်၊ Post Messages permission ပါရမည် |
| Required Join Channels | `getChatMember` ဖြင့် membership စစ်နိုင်ရန် Admin ဖြစ်ရမည် |

Telegram Bot API သည် bot က chat တစ်ခုတွင် Admin မဟုတ်ပါက အခြား user ၏ membership ကို စိတ်ချစွာစစ်နိုင်မည်မဟုတ်ပါ။

## 6. Source / Store post format

### Source Channel

Review post တစ်ခုကို အရင်တင်ပြီး **ချက်ချင်းနောက် post** အဖြစ် video ကို caption ဖြင့်တင်ပါ။

```text
[Review post]
[Video post — caption: Example Movie 2026]
```

Bot သည် Source Channel ၏ အရင်ဆုံး preceding post ID ကို Review post ID အဖြစ်သိမ်းသည်။ Review နှင့် video ကြားတွင် အခြား post တစ်ခုရှိလျှင် အဲဒီအနီးဆုံး post ကိုသာ Review အဖြစ်ယူမည်။

### Store Channel

Video ကို Source video နှင့် caption တူညီစွာတင်ပါ။

```text
[Video post — caption: Example Movie 2026]
```

Matching အောင်မြင်ပါက Source video ၏ Review post ကို Repost Channel သို့ copy လုပ်ပြီး `📥 Download` inline button ပေါင်းထည့်မည်။

### Caption comparison

- Unicode NFKC normalization
- Case-insensitive
- Leading/trailing spaces ဖယ်ရှားခြင်း
- အပို space များနှင့် line endings ညှိခြင်း
- Zero-width characters ဖယ်ရှားခြင်း
- Punctuation ကို မဖယ်ရှားပါ
- Fuzzy matching မလုပ်ပါ
- Multiple Source video captions တူပါက message ID အကြီးဆုံးကိုသာ ယူသည်
- Latest Source video မှာ preceding Review မရှိလျှင် အဟောင်း video ၏ Review ကို fallback မလုပ်ပါ

## 7. Store-first and Source-first recovery

**Upgrade note:** v2.0 တွင် `skipped_no_match` / `skipped_no_review` ဖြစ်ခဲ့သော Store post များ၏ caption ကို D1 ထဲ မသိမ်းခဲ့ပါ။ ထို့ကြောင့် v2.1 migration က အဲဒီအဟောင်းများကို ပြန်လည်ရှာဖွေ၍ match မလုပ်နိုင်ပါ။ ထို records များကို `legacy_skipped` အဖြစ်ထိန်းသိမ်းထားသည်။ v2.1 deploy ပြီးနောက် Store video ကို ပြန်တင်ပါက pending index ထဲသို့ ဝင်ပြီး ၇ ရက်အတွင်း Source post ရောက်လာချိန် ပြန်စစ်နိုင်ပါမည်။ Telegram Bot API က bot မရှိခင် channel history ကို ပြန်ရှာပေးခြင်းမရှိပါ။


- **Source first:** Source Review + video ကို index လုပ်ထားပြီးနောက် Store video တင်လျှင် ချက်ချင်း match/repost လုပ်သည်။
- **Store first:** Store video ကို Pending အဖြစ် ၇ ရက်ထားသည်။ နောက်မှ matching Source video ရောက်လာလျှင် Pending Store post ကို ပြန်စစ်သည်။
- **Late preceding Source post:** Source update တစ်ခု နောက်ကျရောက်လာ၍ အရင် video ၏ nearest preceding post association ပြောင်းသွားပါက Pending matching ကို ထပ်လုပ်သည်။
- **Transient failure:** Telegram API call ပျက်လျှင် `failed` အဖြစ်ထားပြီး webhook retry သို့မဟုတ် ၅ မိနစ် cron recovery ဖြင့် ပြန်ကြိုးစားသည်။
- **Multiple Store posts:** Store channel/message ID တစ်ခုစီကို သီးခြား dedupe လုပ်သည်။ Caption တူသော်လည်း Store post ID မတူလျှင် တစ်ခုစီ processing လုပ်နိုင်သည်။

## 8. User download flow

1. User က Repost Channel ထဲက `📥 Download` ကိုနှိပ်သည်။
2. Bot private chat ကိုဖွင့်ပြီး `/start` deep link မှ token ကို လက်ခံသည်။
3. Required Join Channels အားလုံးကို စစ်သည်။ မ join ရသေးသော channel များကိုသာ button အဖြစ်ပြသည်။ Membership API မတုံ့ပြန်နိုင်သည့် channel များကိုလည်း unknown အဖြစ် ဖော်ပြပြီး ပြန်စစ်ခိုင်းသည်။
4. User က Join ပြီး `Joined — Check Again` နှိပ်သည်။
5. Membership ပြန်အောင်မြင်မှ Store Channel ထဲက file ကို private chat သို့ copy ပို့သည်။
6. ၃ နာရီပြည့်လျှင် Durable Object Alarm က video နှင့် warning ကို delete လုပ်သည်။ ပြီးနောက် `📥 Get File Again` button ပါသော notification ပို့သည်။
7. Get File Again ကိုနှိပ်တိုင်း membership ကို ထပ်စစ်သည်။

Bot ကို User က အရင် `/start` လုပ်ထားခြင်း မရှိပါက Bot သည် User ကို အလိုအလျောက် private message စတင်ပို့မရပါ။ Download deep link ကို User ကနှိပ်ပြီး Start လုပ်ရသည်။

## 9. Local development

```bash
npm install
cp .dev.vars.example .dev.vars
# .dev.vars ကို သင့် test bot/channel IDs/links ဖြင့်ပြင်ပါ
npm run db:migrate:local
npm run check
npm run dev
```

`.dev.vars` ကို GitHub မတင်ပါနှင့်။ Local webhook စမ်းရန် public HTTPS tunnel တစ်ခုလိုသည်။ Local D1 နှင့် Remote D1 သည် သီးခြားဖြစ်သည်။

## 10. Telegram webhook ချိတ်ရန်

Worker deploy ပြီးရင်:

```bash
node scripts/set-webhook.mjs
```

Prompt တောင်းသည့်အတိုင်း Bot Token၊ Worker URL (`https://...workers.dev`) နှင့် `TELEGRAM_WEBHOOK_SECRET` ကိုရိုက်ထည့်ပါ။ Script သည် `message`, `channel_post`, `callback_query` updates များကိုသာလက်ခံရန် သတ်မှတ်သည်။ `max_connections: 1` ကို Source post order ထိန်းရန် အသုံးပြုထားသည်။

Webhook status စစ်ရန်:

```text
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

တကယ့် Bot Token ပါသော URL ကို မည်သူ့ကိုမျှ မျှဝေပါနှင့်။

## 11. Health check

```text
https://<worker-name>.<subdomain>.workers.dev/health
```

`ok: true`, `database: true`, `deliveryCleanup: true` ဖြစ်ရမည်။ `configError` ရှိလျှင် runtime Secrets / D1 binding / Durable Object binding ကိုပြန်စစ်ပါ။

## 12. Retention policy

| Data | Retention |
|---|---:|
| Telegram update duplicate records | 72 hours |
| Store post duplicate records | 72 hours |
| Pending Source video records | 7 days; successful match ပြီးလျှင် ချက်ချင်း delete |
| Source event index | 7 days |
| Pending Store video records | 7 days; successful repost ပြီးလျှင် ချက်ချင်း delete |
| Processing lease | 120 seconds |
| User-delivered video + warning | 3 hours |
| Download token mapping | Repost Channel button အသုံးပြုနိုင်နေသရွေ့ ထားရှိ |

Cloudflare runtime log retention ကို ဒီ application က သီးခြား ၇ ရက်အဖြစ်မသတ်မှတ်ထားပါ။ Dashboard ရှိ observability/logging retention policy သည် account/platform setting အပေါ်မူတည်သည်။ Application log များတွင် Bot Token သို့မဟုတ် webhook secret မထည့်ပါ။

## 13. Tests and deployment boundary

Run locally:

```bash
npm run check
```

CI တွင် syntax checks, Node tests, migration-file assertions နှင့် Wrangler dry-run ကိုလုပ်သည်။ SQLite in-memory migration simulation ကိုလည်း source package စစ်ဆေးစဉ် run လုပ်ထားသည်။ သို့သော် Telegram Bot API နှင့် live Cloudflare D1/Workers integration ကို real credentials မရှိဘဲ အာမခံမပေးနိုင်ပါ။ Production traffic မတင်မီ test channels တွင် Source-first, Store-first, user not joined, user leaves channel, 3-hour cleanup နှင့် Telegram API failure retry ကို စမ်းသပ်ပါ။

## 14. Reliability limitation

Telegram Bot API `copyMessage` အတွက် caller-controlled idempotency key မရှိပါ။ Telegram က repost ကို လက်ခံပြီး D1 ထဲ success status မရေးရသေးခင် Worker ရပ်သွားသည့် အလွန်ရှားပါးသောအခြေအနေ၌ retry လုပ်ရာ duplicate repost ဖြစ်နိုင်မှုကို ၁၀၀% ဖယ်ရှားမရပါ။ Unique Store message records, leases, retry state နှင့် ရှိပြီးသား download mapping ကို ပြန်အသုံးပြုခြင်းဖြင့် အန္တရာယ်ကို လျှော့ထားသည်။

Durable Object Alarm နှင့် Telegram API တို့သည် real-time deadline အတိအကျမဟုတ်သဖြင့် ၃ နာရီပြည့်ပြီးနောက် Cloudflare/Telegram ပြဿနာကြောင့် delete အနည်းငယ်နောက်ကျနိုင်သည်။ Retry ပြန်လုပ်မည်။

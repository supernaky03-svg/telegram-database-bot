# Telegram File Store Bot — Cloudflare Edition 2.0

Cloudflare Workers + D1 + SQLite-backed Durable Objects ကို အသုံးပြုပြီး Telegram Channel များမှ Review post ကို အလိုအလျောက် repost လုပ်ကာ Download link ပေးသည့် Bot ဖြစ်သည်။

**Video file များကို Cloudflare R2 ထဲသို့ မတင်ပါ။** Video များကို Store Channel ထဲတွင်သာ ထားပြီး D1 တွင် mapping/metadata များကို သိမ်းထားသည်။

## 1. ပါဝင်သောလုပ်ဆောင်ချက်များ

- မီနူးအဟောင်း Movies / Series / Ongoing / Bollywood ကို ဖယ်ရှားထားသည်။
- Bot အသုံးမပြုမီ Required Channel အားလုံး Join ဖြစ်/မဖြစ် `getChatMember` ဖြင့် စစ်ဆေးသည်။
- Join မလုပ်ရသေးသော Channel များကိုသာ inline URL buttons အဖြစ် ပြသည်။
- `✅ Joined — Check Again` ကိုနှိပ်လျှင် ပြန်စစ်သည်။
- Download စတင်တိုင်း membership ကို ပြန်စစ်သည်။
- Source Channel မှ post အသစ်များကို `channel_post` update အဖြစ် index လုပ်သည်။
- Source video caption နှင့် Store video caption ကို normalized exact-match ဖြင့် နှိုင်းယှဉ်သည်။
- တူညီသော Source video များစွာရှိလျှင် message ID အကြီးဆုံးဖြစ်သော နောက်ဆုံး video ကို ရွေးသည်။
- ရွေးထားသော Source video post ၏ ချက်ချင်းအပေါ်က Channel post ကို Repost Channel သို့ copy လုပ်သည်။
- Repost အောက်တွင် Bot deep link ပါသော `📥 Download` button ထည့်သည်။
- Download ပြုလုပ်ရာတွင် Store Channel ထဲက မူရင်း video ကို user ထံ copy ပို့သည်။
- Video နှင့် warning message ကို ၃ နာရီအကြာ Durable Object Alarm ဖြင့် ဖျက်သည်။
- ဖျက်ပြီးနောက် `📥 Get File Again` button ပို့သည်။
- Duplicate protection record များကို ၇၂ နာရီထားသည်။
- Pending Source index များကို ၁၆၈ နာရီ (၇ ရက်) ထားသည်။ Match/repost အောင်မြင်လျှင် သက်ဆိုင်ရာ pending record ကို ချက်ချင်းဖျက်သည်။
- Scheduled cleanup ကို ၁ နာရီတစ်ကြိမ် Cron Trigger ဖြင့် လုပ်သည်။
- Webhook secret header စစ်ဆေးခြင်း၊ update deduplication နှင့် retry lease ပါဝင်သည်။

## 2. Architecture

```text
Telegram Source Channel
        │ channel_post updates
        ▼
Cloudflare Worker ───────► D1: source_events + pending_source_posts
        │
        │ Store video arrives
        ▼
Caption normalization + exact match
        │
        ├── no match ─────► skip (no repost)
        │
        └── latest match
                  │
                  ▼
        Copy preceding Review post
                  │
                  ▼
        Telegram Repost Channel
        [📥 Download URL button]
                  │
                  ▼
        Bot /start dl_<token>
                  │
                  ▼
        Check all required memberships
                  │
                  ▼
        D1 mapping → copy Store video to user
                  │
                  ▼
        Durable Object Alarm (+3 hours)
                  │
                  ├── delete copied video
                  ├── delete warning
                  └── send Get File Again button
```

### Components

| Component | အသုံးပြုပုံ |
|---|---|
| Cloudflare Worker | Telegram webhook, caption matching, join verification, Bot API |
| D1 | Pending Source index, download tokens, deduplication |
| Durable Object (SQLite) | ၃ နာရီအကြာ ဖျက်ရန် job queue + Alarm |
| Cron Trigger | Expired records cleanup |
| Telegram Channels | Video files နှင့် Review posts ကို သိမ်းထားရာနေရာ |

## 3. အရေးကြီးသော Telegram ကန့်သတ်ချက်

Telegram Bot API တွင် Channel history အဟောင်းများကို လွတ်လပ်စွာ search/fetch လုပ်နိုင်သော method မရှိပါ။ ထို့ကြောင့် ဒီ project သည် Bot ကို Source Channel တွင် Admin အဖြစ် ထည့်ပြီးနောက် ရောက်လာသော post အသစ်များကိုသာ index လုပ်နိုင်သည်။

**အကောင်းဆုံးအစီအစဉ်:** Bot ကို Source Channel တွင် Admin ထည့်ပါ → Worker deploy လုပ်ပါ → Webhook set လုပ်ပါ → ထို့နောက် Source Channel တွင် Review + Video post အသစ်များ ဝင်လာစေပါ။

Bot မရောက်ခင်ကတည်းက Source Channel ထဲတွင် ရှိနေသော post အဟောင်းများကို ဒီ Bot တစ်ခုတည်းဖြင့် ပြန် index မလုပ်နိုင်ပါ။

## 4. Cloudflare resources ဖန်တီးခြင်း

Ubuntu / Termux / PC တွင် Node.js 20+ နှင့် npm ရှိရန်လိုသည်။

```bash
unzip telegram-file-store-bot-cloudflare.zip
cd telegram-file-store-bot-cloudflare
npm install
```

### 4.1 D1 Database ဖန်တီးရန်

```bash
npx wrangler d1 create telegram-file-store-bot-db
```

Command output ထဲက `database_id` ကို copy လုပ်ပြီး `wrangler.jsonc` ထဲရှိ

```json
"database_id": "REPLACE_WITH_D1_DATABASE_ID"
```

နေရာတွင် အစားထိုးပါ။

### 4.2 Database migration

Local test database:

```bash
npx wrangler d1 migrations apply DB --local
```

Production database:

```bash
npx wrangler d1 migrations apply DB --remote
```

**Production database ကို migration မလုပ်ခင် `wrangler.jsonc` ထဲရှိ database ID မှန်ကြောင်း စစ်ပါ။**

## 5. Cloudflare Variables / Secrets

### 5.1 `wrangler.jsonc` ထဲတွင် ပြင်ရန်

| Variable | ထည့်ရန် |
|---|---|
| `BOT_USERNAME` | Bot username (`@` မပါ) |
| `SOURCE_CHANNEL_ID` | Source Channel numeric ID (`-100...`) |
| `STORE_CHANNEL_ID` | Store Channel numeric ID (`-100...`) |
| `REPOST_CHANNEL_ID` | Repost Channel numeric ID (`-100...`) |

Channel ID များသည် `@username` မဟုတ်ဘဲ numeric ID ဖြစ်ရမည်။

### 5.2 Cloudflare Secrets ထည့်ရန်

```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put LINK1
npx wrangler secret put LINK2
```

တစ်ခုချင်းစီ command 실행 လုပ်ပြီး တောင်းလာသောအခါ value ထည့်ပါ။

`TELEGRAM_WEBHOOK_SECRET` ကို ခန့်မှန်းရခက်သော random value သုံးပါ။ Telegram လက်ခံသောစာလုံးများမှာ `A-Z`, `a-z`, `0-9`, `_`, `-` ဖြစ်သည်။

### 5.3 Channel Join Secrets

သင်သတ်မှတ်ထားသော LINK1, LINK2 ပုံစံကို တိုက်ရိုက်ထောက်ပံ့ထားသည်။

Cloudflare Secrets ထဲတွင်:

```bash
npx wrangler secret put LINK1
npx wrangler secret put LINK2
```

`wrangler.jsonc` ထဲရှိ `vars` အောက်မှာ ID နှင့် ခေါင်းစဉ် ထည့်ပါ။

```json
"CHANNEL_ID1": "-1001111111111",
"CHANNEL_TITLE1": "Required Channel 1",
"CHANNEL_ID2": "-1002222222222",
"CHANNEL_TITLE2": "Required Channel 2"
```

တတိယ Channel ထပ်ထည့်မည်ဆိုလျှင် `LINK3`, `CHANNEL_ID3`, `CHANNEL_TITLE3` အဖြစ် ဆက်ထည့်ပါ။ `CHANNEL_TITLE` မထည့်လျှင် default အမည်သုံးမည်။ `LINKn` နဲ့ `CHANNEL_IDn` နှစ်ခုစလုံး မဖြစ်မနေလိုအပ်သည်။

အစားထိုးနည်းအနေဖြင့် `JOIN_CHANNELS_JSON` Secret တစ်ခုတည်းကိုလည်း သုံးနိုင်သည်။

```json
[{"channel_id":"-1001111111111","title":"Required Channel 1","link":"https://t.me/+INVITE_CODE_1"},{"channel_id":"-1002222222222","title":"Required Channel 2","link":"https://t.me/+INVITE_CODE_2"}]
```

- `channel_id` = membership စစ်မည့် Channel ID
- `title` = User မြင်ရမည့် အမည်
- `link` = User Join လုပ်ရန် invite link
- Channel တစ်ခုစီအတွက် bot ကို Administrator ထည့်ထားရမည်။
- Bot admin မဖြစ်လျှင် `getChatMember` ဖြင့် အခြား user ၏ membership ကို အာမခံစစ်မရပါ။

## 6. Telegram Bot ကို Channel များတွင် ထည့်ရန်

Bot ကို အောက်ပါ permission များဖြင့် Admin ထည့်ပါ။

| Channel | လိုအပ်ချက် |
|---|---|
| Source Channel | Admin ဖြစ်ရမည်။ New channel posts ကို လက်ခံရန် |
| Store Channel | Admin ဖြစ်ရမည်။ New video posts ကို လက်ခံရန်၊ message ကို copy လုပ်နိုင်ရန် |
| Repost Channel | Admin ဖြစ်ရမည်။ Post messages permission လိုအပ်သည် |
| Required Join Channels | `getChatMember` အတွက် Admin ဖြစ်ရမည် |

Required Join Channel များသည် Source / Store / Repost Channel များနှင့် မတူနိုင်ပါ။ Channel တစ်ခုတည်းဖြစ်လျှင် ID တူညီစွာ ထည့်နိုင်သော်လည်း `SOURCE_CHANNEL_ID`, `STORE_CHANNEL_ID`, `REPOST_CHANNEL_ID` သုံးခုကတော့ တစ်ခုနှင့်တစ်ခု မတူရပါ။

## 7. Local development

Local secrets file ပြုလုပ်ရန်:

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` ထဲက BOT_TOKEN, webhook secret, JOIN_CHANNELS_JSON ကို ပြင်ပါ။ `.dev.vars` ကို GitHub သို့ မတင်ပါနှင့်။

Local test:

```bash
npm run check
npm run dev
```

Local Worker URL ကို Telegram webhook အဖြစ် ချိတ်ရန် public HTTPS tunnel လိုအပ်သည်။ Production deployment ကို အောက်ပါအတိုင်း လုပ်နိုင်သည်။

## 8. Deploy

```bash
npx wrangler deploy
```

Deploy အောင်မြင်လျှင် `https://<worker-name>.<subdomain>.workers.dev` ပုံစံ Worker URL ရမည်။

Health check:

```text
https://<worker-name>.<subdomain>.workers.dev/health
```

`ok: true` ဖြစ်ရမည်။ `configError` ရှိလျှင် Worker variables / secrets / bindings ကို ပြန်စစ်ပါ။

## 9. Telegram Webhook ချိတ်ရန်

Terminal မှ:

```bash
node scripts/set-webhook.mjs
```

အောက်ပါတို့ကို တောင်းပါမည်။

- Telegram BOT_TOKEN
- Worker URL
- TELEGRAM_WEBHOOK_SECRET

Script သည် `/telegram/webhook` endpoint သို့ ချိတ်ပြီး `message`, `channel_post`, `callback_query` updates များကိုသာ လက်ခံရန် သတ်မှတ်ပေးသည်။ `max_connections: 1` သုံးထားခြင်းကြောင့် Source Channel post ordering ကို ထိန်းသိမ်းရန် ကူညီသည်။

## 10. အသုံးပြုပုံ

### Source Channel ထဲတွင်

Review post တစ်ခုကို အရင်တင်ပါ။ ထို့နောက် အဲဒီ Review နှင့် သက်ဆိုင်သည့် Video post ကို caption ဖြင့် တင်ပါ။

```text
[Movie Review post]
[Video post — caption: Example Movie 2026]
```

Bot သည် Video post ၏ caption နှင့် ချက်ချင်းအပေါ်က post ID ကို index လုပ်ထားမည်။

### Store Channel ထဲတွင်

Store Channel ထဲသို့ Video ကို caption တူညီစွာ တင်ပါ။

```text
[Video post — caption: Example Movie 2026]
```

Caption တူညီလျှင် Source Channel မှ နောက်ဆုံး matching video ကို ရွေးပြီး ၎င်း၏ အပေါ်က Review post ကို Repost Channel သို့ copy လုပ်မည်။ Repost အောက်တွင် Download button ပါလာမည်။

### Download

- User သည် Download ကိုနှိပ်လျှင် Bot private chat ကိုဖွင့်မည်။
- Required Channel များကို Join မလုပ်ရသေးပါက လိုအပ်သည့် Channel များကိုသာ ပြမည်။
- Join ပြီး `Joined — Check Again` နှိပ်လျှင် membership ပြန်စစ်ပြီး Download ကို ဆက်လုပ်မည်။
- Video ကို user ထံ copy ပို့မည်။
- ၃ နာရီအကြာ Video နှင့် warning ကို delete လုပ်မည်။
- `Get File Again` button ကို ပြန်ပို့မည်။

## 11. Caption matching rules

- Unicode NFKC normalization
- Case-insensitive comparison
- Leading / trailing spaces ဖယ်ရှားခြင်း
- အပို space များကို တစ်ခုတည်းအဖြစ် ပြောင်းခြင်း
- Line ending ကို တစ်ပုံစံတည်းထားခြင်း
- Zero-width characters ဖယ်ရှားခြင်း
- Punctuation ကို မဖယ်ရှားပါ။
- Fuzzy matching မလုပ်ပါ။
- Matching Source video များစွာရှိလျှင် `source_message_id` အကြီးဆုံးကို ရွေးသည်။
- အဲဒီနောက်ဆုံး matching video တွင် preceding post မရှိပါက ဒီ Store post ကို repost မလုပ်ဘဲ skip လုပ်သည်။
- Store video ရောက်ချိန်တွင် Source match မရှိလျှင် repost မလုပ်ဘဲ skip လုပ်သည်။ နောက်မှ Source video တက်လာခြင်းကြောင့် အရင် skip ဖြစ်သော Store post ကို အလိုအလျောက် ပြန်မစစ်ပါ။

## 12. Retention policy

| Data | Retention |
|---|---:|
| Duplicate protection: Store Message ID | 72 hours |
| Telegram update dedup records | 72 hours |
| Pending Source video index | 168 hours (7 days) |
| Source event ordering index | 168 hours (7 days) |
| Matched pending Source record | Successful repost ပြီးချင်း delete |
| Download token mapping | Download button ကို ဆက်အသုံးပြုနိုင်သရွေ့ ထိန်းထား |
| Delivered video + warning | 3 hours |

Download mapping ကို automatic expiry မထားပါ။ အကြောင်းမှာ Repost Channel ထဲက Download button က အချိန်ကြာပြီးမှလည်း အလုပ်လုပ်စေရန်ဖြစ်သည်။ Store file ကို အပြီးဖျက်လိုက်ပါက သက်ဆိုင်ရာ download mapping ကို D1 မှလည်း ကိုယ်တိုင်ဖျက်ရမည်။

## 13. Troubleshooting

### Membership အမြဲမအောင်မြင်
- Bot သည် Required Join Channel တိုင်းတွင် Admin ဖြစ်ကြောင်းစစ်ပါ။
- `channel_id` သည် numeric `-100...` ဖြစ်ကြောင်းစစ်ပါ။
- Invite link နှင့် channel ID တို့သည် Channel တစ်ခုတည်းကို ရည်ညွှန်းကြောင်းစစ်ပါ။

### Source video ကို မတွေ့
- Bot ကို Source Channel တွင် Admin ထည့်ပြီး webhook အောင်မြင်စွာချိတ်ထားကြောင်း စစ်ပါ။
- Bot deploy မလုပ်မီ ရှိပြီးသား Source posts များကို Bot API ဖြင့် ပြန်ရှာမရပါ။
- Source video နှင့် Store video caption တို့ကို normalization ပြီးနောက် တိတိကျကျ တူညီရမည်။
- Source post အစဉ်မှာ Review post အရင်၊ Video post နောက် ဖြစ်ရမည်။

### Review post မတက်
- Source video ၏ ချက်ချင်းအပေါ်က post ကိုသာယူသည်။
- Latest matching Source video ၏ အပေါ်က post ကို Bot က index မလုပ်နိုင်ခဲ့လျှင် skip ဖြစ်နိုင်သည်။
- Repost Channel တွင် bot ကို `Post Messages` permission ပါသော Admin ထည့်ထားရမည်။

### User ထံ file မပို့နိုင်
- Store Channel ထဲက file ကို Bot က copy လုပ်နိုင်ကြောင်းစစ်ပါ။
- User သည် Bot ကို `/start` လုပ်ထားရမည်။
- Bot သည် user ကို ပထမဆုံး DM ပို့၍မရနိုင်သော Telegram ကန့်သတ်ချက်ကြောင့် Channel ထဲက Download URL ကိုနှိပ်ပြီး Bot ကို Start လုပ်ရန်လိုသည်။

### 3-hour deletion မဖြစ်
- Durable Object binding `DELIVERY_CLEANUP` နဲ့ `DeliveryCleanup` export ရှိကြောင်း စစ်ပါ။
- Deploy ပြီး `/health` မှာ `deliveryCleanup: true` ဖြစ်ရမည်။
- Worker logs နှင့် Durable Object alarm execution logs ကိုစစ်ပါ။

## 14. Reliability notes

- Webhook ကို `X-Telegram-Bot-Api-Secret-Token` ဖြင့် ကာကွယ်ထားသည်။
- `update_id` duplicate protection ပါသည်။
- Store channel/message ID ကို composite primary key ဖြင့် ၇၂ နာရီ duplicate protection လုပ်ထားသည်။
- Store processing row တွင် lease ပါသောကြောင့် Worker crash ဖြစ်သည့်အခါ stuck record ကို ပြန်ကြိုးစားနိုင်သည်။
- Telegram Bot API ၏ `copyMessage` တွင် caller-provided idempotency key မရှိသဖြင့် Telegram ထံ copy အောင်မြင်ပြီး D1 ထဲ success record မရေးရသေးခင် Worker ရပ်သွားသည့် အလွန်ရှားပါးသောအခြေအနေ၌ duplicate repost ကို ၁၀၀% အာမခံကာ ကာကွယ်မရပါ။ Project သည် အန္တရာယ်ကို လျှော့ချရန် unique records, leases, download mapping reuse တို့ကို သုံးထားသည်။
- Durable Object Alarm သည် at-least-once ဖြစ်သည်။ Deletion ကို idempotent လုပ်ထားပြီး failure ဖြစ်ပါက ပြန်စီစဉ်သည်။ Cloudflare maintenance / downstream API အခက်အခဲကြောင့် ၃ နာရီပြည့်ချိန်တွင် အနည်းငယ်နောက်ကျနိုင်သည်။
- Telegram `deleteMessage` က ၄၈ နာရီအတွင်း ဖျက်ခွင့်ရှိပြီး project ၏ ၃ နာရီ deadline သည် ထိုကန့်သတ်ချက်အတွင်း ဖြစ်သည်။

## 15. Security

- Bot token၊ webhook secret၊ join channel configuration ကို Cloudflare Secrets ထဲတွင်သာထားပါ။
- `.dev.vars` ကို မျှဝေခြင်း / GitHub တင်ခြင်း မလုပ်ပါနှင့်။
- GitHub repository ထဲတွင် တကယ့် Bot Token မထည့်ပါနှင့်။
- Download token သည် random URL-safe token ဖြစ်ပြီး raw Store Message ID ကို user-facing link ထဲတွင် မထည့်ပါ။
- Bot သည် Required Join Channel တွင် membership ကို Download တစ်ကြိမ်စီ စစ်သည်။

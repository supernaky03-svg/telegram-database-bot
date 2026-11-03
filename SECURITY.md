# Security Policy

- Never commit Telegram bot tokens, webhook secrets, `.dev.vars`, or private channel invite links.
- Store `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, all core channel IDs, and all required-join channel IDs/links in Cloudflare Worker runtime Secrets.
- `BOT_USERNAME` is a non-sensitive runtime variable; update it when using a different bot.
- Rotate the Telegram bot token with BotFather immediately if it is exposed.
- Rotate the webhook secret in Cloudflare and Telegram webhook configuration together. Never log either value.
- Keep the bot administrator role limited to the channel permissions it needs.
- The bot must be an administrator in required-join channels for reliable `getChatMember` checks.
- Treat download tokens as bearer credentials. Anyone with a valid token may request the associated Store message, but channel membership is rechecked at every download attempt.
- Store channel IDs and join invite links in Secrets if they should not appear in repository history. They are not substitutes for the actual bot token/webhook secret protection.
- Do not expose the bot token in screenshots, shell history, URLs shared in chats, or logs.

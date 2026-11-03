# Security Policy

- Never commit Telegram bot tokens, webhook secrets, or `.dev.vars`.
- Rotate `BOT_TOKEN` with BotFather immediately if it is exposed.
- Keep the bot administrator role limited to the permissions required by each channel.
- Do not publish `JOIN_CHANNELS_JSON` if invite links are private.
- Treat D1 download tokens as bearer credentials; anyone holding a valid token can request the linked Store message, subject to membership verification.
- The bot verifies required-channel membership at every download attempt.

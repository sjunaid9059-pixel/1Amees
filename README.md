# Meesho Loot Premium v2 (Flat)

Sab files ek hi folder me — phone se seedha GitHub repo banao, Render pe host karo.

## Setup (phone / PC)

1. Unzip
2. `npm install`
3. `.env` me `TG_WEBAPP_URL` = apna Render URL (HTTPS)
4. `npm start`

## Render

- Root Directory: blank (flat)
- Build: `npm install`
- Start: `node server.js`
- Env vars: copy from `.env`

## Telegram

- Bot token already in `.env`
- Admin chat id: `5427735251` (order + payment alerts yahan aayenge)
- BotFather → Menu Button → Web App URL = Render URL
- Bot ko `/start` → Open button

## Optional bot package

```bash
npm install node-telegram-bot-api
```

Without it app still runs; only Telegram alerts /start button need the package.

## Payment

Cart → Proceed to Pay → Meesho UPI QR (`meesho@ybl`) → Open UPI / Scan → I have paid → confirmed.
Admin ko Telegram pe notification milta hai.

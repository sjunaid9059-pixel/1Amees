# Meesho Loot Premium v2.0 — Manifest

**Improvements over previous rebuild**

| Area | Before | After |
|------|--------|-------|
| Speed | Heavy static, no compression | compression + etag + rate-limit + lean responses |
| Telegram | SDK only, no bot | Full bot with /start + WebApp button |
| Payment | Instant “order placed” | Meesho-branded UPI QR + upi:// deep link |
| UI | Functional | Premium pink candy, skeletons, payment sheet |
| Stability | Syntax error in server (`app.get '…'`) | Clean, tested endpoints |
| Auth persistence | Memory only per request | localStorage token + Bearer |
| Cart / Orders | Basic | Full flow with status + re-pay |

**Bot token pre-filled in `.env`**

```
TG_BOT_TOKEN=8403186228:AAFqujeM4UogpOTcOmniSTBb-2GxtjtRyVQ
```

**Run**

```bash
npm install && npm start
# or
docker-compose up -d --build
```

**Repo-ready** — clone, `npm i`, set `TG_WEBAPP_URL` to your HTTPS domain, done.

# @picki/web — Customer Web (demo)

Minimal Next.js UI for Sprint 4–6 demo: login (OTP), zone discover, join KVL.

## Run locally

```bash
# Terminal 1 — API (from repo root)
pnpm dev:setup   # Postgres + migrate + seed
pnpm api:dev

# Terminal 2 — Web
pnpm web:dev
```

Open **http://localhost:3001**

Demo GPS is fixed to Kim Văn – Kim Lũ pilot anchor (`20.9883, 105.8414`).

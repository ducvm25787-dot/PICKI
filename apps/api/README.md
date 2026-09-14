# @picki/api — Picki Backend

NestJS modular monolith. **Sprint 2:** Auth. **Sprint 3:** Geo + PostGIS.

## Run locally

```bash
# From repo root (Postgres must be up)
pnpm db:up
pnpm db:migrate

export DATABASE_URL=postgresql://picki:picki@localhost:5432/picki
export SESSION_SECRET=local-dev-secret-16chars
export AUTH_OTP_DEV_EXPOSE=true

pnpm api:dev
```

API: `http://localhost:3000/v1`

## Auth endpoints (S2)

| Method | Path                     | Description                                   |
| ------ | ------------------------ | --------------------------------------------- |
| GET    | `/v1/health`             | Health check                                  |
| POST   | `/v1/auth/otp/request`   | Request phone OTP `{ phone }`                 |
| POST   | `/v1/auth/otp/verify`    | Verify OTP → session cookie `{ phone, code }` |
| POST   | `/v1/auth/email/request` | Request email OTP `{ email }`                 |
| POST   | `/v1/auth/email/verify`  | Verify email OTP                              |
| POST   | `/v1/auth/logout`        | Revoke session                                |
| GET    | `/v1/me`                 | Current user (requires cookie)                |
| PATCH  | `/v1/me`                 | Update `displayName`, `activeZoneId`          |

Session cookie: `picki_session` (HttpOnly). In development, OTP is returned as `devOtp` in the response.

## Tests

```bash
pnpm api:e2e
```

Identity is always `users.id` (Picki UUID). Phone/email map via `user_identities`.

## Geo endpoints (S3)

| Method | Path               | Description                                         |
| ------ | ------------------ | --------------------------------------------------- |
| GET    | `/v1/geo/status`   | PostGIS version + routing provider                  |
| POST   | `/v1/geo/distance` | `{ from, to }` → meters (PostGIS)                   |
| POST   | `/v1/geo/contains` | `{ geometryWkt, point }` → point-in-polygon         |
| POST   | `/v1/geo/eta`      | `{ from, to }` → seconds (local adapter / fallback) |
| POST   | `/v1/geo/geocode`  | `{ query }` → point (vendor later)                  |
| POST   | `/v1/geo/reverse`  | `{ lat, lng }` → address (vendor later)             |

Zone boundaries stay in Picki DB (S5). External map vendor plugs into `GEO_ADAPTER`.

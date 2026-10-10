# Deployment

The Next.js app can run on Vercel or any Node host. PostgreSQL, Redis, and the worker are separate.

## Production settings

Set these before exposing the app:

- `AUTH_MODE=credentials`. Do not use `dev-auto` on a shared deployment.
- `SESSION_SECRET` to a long random string. The default in `.env.example` is not safe to ship.
- `DATABASE_URL` and `REDIS_URL` to managed Postgres and Redis.
- `APP_URL` to the public https origin. Telegram webhooks are registered against this origin.
- `ENCRYPTION_KEY` to 64 hex characters if operators will save a bot token in the database.
- `JOB_RUNNER=bullmq` and run `npm run worker` as its own process. The inline runner is for a single local Node process.
- `TELEGRAM_WEBHOOK_SECRET` before pointing Telegram at `/api/telegram/webhook/:projectId`.

Apply schema changes with:

```bash
npx prisma migrate deploy
npm run db:seed
```

Seed creates the first owner from `SEED_EMAIL` and `SEED_PASSWORD` when that user does not exist. Change the password after the first login if the database is reachable by anyone else.

Build and start:

```bash
npm run build
npm run start
npm run worker
```

`npm run start` listens on port 43123. Put TLS in front of it, or set the platform port and update `APP_URL`.

## GitHub Pages

The repository remote for public source is `https://github.com/JackMiller825/TokenLaunchAI.git`. Every update should be pushed there. `npm run build:pages` writes the static interface to `docs/`. GitHub Pages serves that folder from `main` at [https://tokenlaunchai.site/](https://tokenlaunchai.site/).

The custom domain is the site root, so the static export uses an empty base path. It does not crawl websites or store projects. Pages uses branch `main` and folder `/docs`, because the current GitHub login can push the site but cannot push Actions workflow files. `.github/workflows/pages.yml` is ready for when the token includes the `workflow` scope.

## Vercel

The App Router project is compatible with a Vercel Node deployment for the web process. Set the environment variables in the project settings. Vercel will not keep the BullMQ worker alive, so run `npm run worker` on a small always-on Node service that can reach the same Postgres and Redis.

Server-sent scan updates need a runtime that allows streaming responses. If a host buffers SSE, the analyzer still polls scan status.

## What stays manual

These are labeled in Integrations and are not simulated:

- Official Telegram Ads submission. The planner prepares copy and checks the published 160-character limit and destination shape. It does not call an ads buying API.
- Third-party Telegram analytics. There is no configured vendor. Use public previews, CSV, and numbers you type.
- Image generation, unless `IMAGE_PROVIDER=openai` and `OPENAI_API_KEY` are both set. Otherwise you get prompts and extracted files.
- Playwright rendering, unless `PLAYWRIGHT_ENABLED=1` and Chromium is installed on that machine.
- Paid placements, outreach to other channels, and broadcasts. Each requires an approval row and, for Telegram, a connected bot plus an opted-in audience.
- Wallet signing and trading. They are out of scope.

## Operations

- Scans are idempotent at the claim step. Re-running a scan keeps user-accepted corrections and refreshes original extracted values.
- Duplicating a project copies reusable task templates and budget settings. It does not copy the other token's facts.
- Audit rows record sign-in, scans, fact edits, approvals, and publishes.
- Rate limit on `POST /api/analyze` is 12 scans per hour per user.
- Do not log bot tokens, session secrets, or RPC keys. The integrations API returns connection state, not secret values.

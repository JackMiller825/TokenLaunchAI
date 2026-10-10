# TokenLaunch AI

TokenLaunch AI is a marketing command center for Ethereum meme-token launches. Paste a public token website, and the app crawls it, stores evidence for every extracted fact, and builds a Telegram-first advertising plan from those facts.

The example URL on the home page is `https://elonerd.site/`. That site is a live integration check of the generic pipeline. Its name, ticker, and copy are not hardcoded results.

## What you can do

1. Enter a token website and optional launch settings.
2. Watch a real research job move through crawl, extraction, chain checks, discovery, strategy, copy, and the launch schedule.
3. Correct facts. Original extracted values stay stored beside your edits.
4. Review public Telegram candidates. Missing subscribers, views, and prices stay **Unknown**.
5. Draft posts, check Telegram Ads length and policy flags, and approve anything that spends money, publishes, or messages outsiders.
6. Track readiness, the calendar, and metrics you actually import or measure.
7. Export Markdown, PDF, JSON, CSV, and a creative ZIP.

## Local setup

Requirements: Node.js 22, PostgreSQL 16, and Redis 7. Docker Compose can run the databases.

```bash
cp .env.example .env
docker compose up -d
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

With `AUTH_MODE=dev-auto` (the local default), the home page signs in the seeded owner:

- Email: `owner@tokenlaunch.local`
- Password: `launch-desk-dev`

Use `AUTH_MODE=credentials` on any shared machine and sign in at `/login`.

On Windows, use the same npm scripts from PowerShell or cmd. `docker compose up -d` starts Postgres and Redis if Docker Desktop is installed. If you already have Postgres and Redis, point `DATABASE_URL` and `REDIS_URL` at them and skip Compose.

## Jobs

`JOB_RUNNER=inline` runs research inside the Next.js process. That is the local default.

`JOB_RUNNER=bullmq` queues work in Redis. Start a second process:

```bash
npm run worker
```

Do not run the inline sweeper and the worker against the same Redis jobs.

## Checks

```bash
npm run typecheck
npm test
npm run lint
npm run check:live
```

`npm run check:live` fetches a public site (default `https://elonerd.site/`) and prints extracted facts. It does not write to the database and it does not invent a contract address.

## Optional keys

Leave a key empty and the related screen says the provider is not connected. The research path still runs on rules and public pages.

| Variable                             | Used for                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                     | Grounded rewrites. Invalid or invented model output is discarded.                                   |
| `SEARCH_PROVIDER` / `SEARCH_API_KEY` | Brave or Serper. Without them, discovery uses public Telegram previews and CSV import.              |
| `ETH_RPC_URL`                        | Read bytecode, symbol, decimals, supply, and owner when a contract address was extracted.           |
| `ETHERSCAN_API_KEY`                  | Optional explorer cross-check.                                                                      |
| `TELEGRAM_BOT_TOKEN`                 | Official Bot API for a community you administer.                                                    |
| `TELEGRAM_WEBHOOK_SECRET`            | Required before a webhook is accepted.                                                              |
| `TELEGRAM_ADMIN_IDS`                 | Numeric user ids allowed to use admin bot commands.                                                 |
| `ENCRYPTION_KEY`                     | 64 hex characters. Encrypts a bot token saved in the database.                                      |
| `IMAGE_PROVIDER=openai`              | Image generation. Otherwise the studio keeps extracted files and prompts only.                      |
| `PLAYWRIGHT_ENABLED=1`               | Browser render after HTTP and script-bundle extraction are not enough. Install Chromium separately. |

## GitHub

Source updates also go to [JackMiller825/TokenLaunchAI](https://github.com/JackMiller825/TokenLaunchAI). The static interface in `docs/` is what GitHub Pages serves at `https://jackmiller825.github.io/TokenLaunchAI/`. Rebuild it with `npm run build:pages` before pushing. `.github/workflows/pages.yml` can publish that build automatically once the GitHub token includes the `workflow` scope.

GitHub Pages cannot run the research server, Postgres, Redis, or Telegram webhooks. The published site is the launch screen and a notice on the desk routes. Analysis, saved projects, and approvals stay on `npm run dev` or a Node host.

```bash
npm run build:pages
```

## More detail

- [ARCHITECTURE.md](ARCHITECTURE.md) — modules, data, and safety rules.
- [DEPLOYMENT.md](DEPLOYMENT.md) — production settings and what is not automated.

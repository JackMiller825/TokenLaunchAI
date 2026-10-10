# Architecture

TokenLaunch AI is a Next.js App Router application. The browser talks to route handlers. Long research runs as a job, either inline in the Next.js process or on a BullMQ worker.

## Request path

1. The home form posts to `POST /api/analyze`.
2. The handler creates a project, website, and `WebsiteScan` in PostgreSQL, then enqueues the scan.
3. `runScan` claims the row (`QUEUED` or `FAILED` to `RUNNING`) so a retry cannot double-run it.
4. Progress is the sum of finished stage weights, not a timer. The analyzer page listens on `GET /api/scans/:id/events` (server-sent events).
5. Cancel sets the scan to cancelled. The runner checks that flag between stages. Retry requeues a failed or cancelled scan.
6. A scan whose heartbeat is stale is returned to `QUEUED` and picked up again.

Stage weights: validate 5, crawl 18, extract 14, social 8, verify 10, audience 8, discover 10, strategy 10, content 8, schedule 5, report validation 4.

## Research

`src/lib/research/ssrf.ts` blocks private, loopback, link-local, metadata, and non-public hosts before a connection. `safeFetch` connects to a resolved public address and sends the original hostname, so a DNS rebinding answer cannot redirect the TCP connection onto a private IP. Redirects are limited, bodies are capped, and timeouts are strict.

`src/lib/research/crawl.ts` fetches HTML first and obeys robots rules for extra pages and scripts. If the homepage has little visible text, it downloads a few same-origin JavaScript bundles and reads them as data. Playwright runs only when `PLAYWRIGHT_ENABLED=1` and only as a later step. Page text is never treated as an instruction to the app.

`src/lib/research/extract.ts` pulls identity, tokenomics, links, and image URLs. Every fact keeps a source URL, source type, excerpt, status, and confidence. Statuses are `VERIFIED`, `REPORTED_UNVERIFIED`, `MISSING`, `CONFLICTING`, and `NEEDS_CONFIRMATION`. A contract-shaped string in a bundle is ignored unless it is assigned as the contract or sits next to a contract label or an explorer token URL. Website claims that liquidity is burned or ownership is renounced stay unverified. Social links stay `NEEDS_CONFIRMATION`.

`src/lib/research/chain.ts` calls `eth_getCode`, `symbol`, `decimals`, `totalSupply`, and `owner` only when `ETH_RPC_URL` is set and an address was extracted. It does not mark LP as burned.

## Marketing

Rules in `src/lib/marketing` build the profile, intelligence, 72-to-1-hour strategy, copy pack, budget split, readiness checklist, and calendar tasks from stored facts. Copy omits an unverified contract (`Not published.`). Telegram Ads drafts are checked against a 160-character limit and are not marked eligible for meme-token investment ads. The app does not submit ads to Telegram.

If `OPENAI_API_KEY` is set, structured JSON rewrites can replace a rules draft. Output that invents a contract or promises returns is rejected and the rules text is kept.

## Discovery

`src/lib/discovery` reads public `t.me` previews for a small directory of well-known channels, plus any public usernames found on the token site or returned by Brave/Serper when those keys exist. Subscriber text is parsed from the public preview when it is present. Price, contact, and average views stay empty unless a preview, a CSV row, or a typed quote provides them. Ranking weights are relevance 30, engagement 25, cost 20, credibility 15, freshness 10. Missing metrics score as zero and lower confidence. They are not filled with favorable guesses.

Sponsorship status moves from Discovered through Reviewed. The desk does not message channel admins by itself.

## Telegram bot

`src/lib/telegram/bot.ts` verifies the webhook secret, handles `/start`, `/project`, `/website`, `/tokenomics`, `/community`, `/launch`, `/contract`, `/links`, `/subscribe`, `/unsubscribe`, and `/help`, and restricts admin commands. Subscribers are explicit opt-ins. Approved publication goes through `src/lib/jobs/publish.ts` and skips duplicate delivery keys.

## Data

Prisma models cover users, organizations, memberships, projects, scans, pages, facts, evidence, token profiles, social accounts, communities, advertising opportunities, quotes, strategies, campaigns, tasks, placements, metrics, assets, drafts, approvals, scheduled jobs, Telegram integrations and subscribers, readiness items, audit logs, reports, comments, and notifications. Money uses decimals. Project routes load rows only inside the signed-in organization.

Roles are Viewer, Analyst, Marketing, and Owner. Viewers can read. Analysts can correct facts and comment. Marketing can edit campaigns, copy, and imports. Owners manage membership and integrations.

## Interface

Routes live under `src/app/(desk)`. Shared layout, navigation, and the project assistant are in `src/components/shell.tsx`. Forms use React Hook Form and Zod. Charts use Recharts. Server state uses TanStack Query. Visual primitives are Tailwind components (`btn`, `field`, `panel`) on a dark navy canvas. Radix packages are installed for overlays; most desk controls are native form elements styled to match.

Reports are built in `src/lib/reports/build.ts` (Markdown, PDF via pdf-lib, JSON, CSV). Creative ZIP files include a `manifest.json` and do not pretend a missing image was generated.

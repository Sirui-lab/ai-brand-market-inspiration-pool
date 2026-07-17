# AI Brand & Market Inspiration Pool

Internal knowledge base for Kimi Global Social Media Team. It stores, searches, and reuses high-performing overseas social-media cases from AI brands.

## Scope

V1 brands:

- ChatGPT / OpenAI
- Claude / Anthropic
- Notion
- Perplexity
- Cursor

V1 platforms:

- Instagram
- X
- LinkedIn
- YouTube
- Reddit

TikTok is out of scope.

V1 AI Analysis fields stay intentionally narrow:

- Post Structure
- Post Content
- Visual Design

Do not expand these into Tone, Takeaways, Summary, or other main fields in V1.

## Phase 0 Status

Phase 0 is complete. Included:

- Excel upload
- Validate / preview before commit
- Multi-sheet parsing
- Brand mapping from sheet names and aliases
- Brand alias normalization into ChatGPT, Claude, Notion, Perplexity, Cursor
- Instagram header parsing
- Original post hyperlink extraction from Excel
- Likes normalization, such as `9.6w -> 96000`, `8k+ -> 8000`, `600+ -> 600`
- Publish date parsing when available
- URL canonicalization and external post id extraction
- Content fingerprint generation
- Preview statuses: valid, warning, error, duplicate
- Deduplication by platform post id, canonical URL, then content fingerprint
- Idempotent commit protection
- Human analysis stored separately from future Kimi analysis
- Historical imports create `source = human` CaseAnalysis records
- Media Library UI with platform sections, brand groups, likes ordering, filters, expandable cases, original links, and the three V1 analysis fields

Known Phase 0 note:

- The current local database may contain repeated test-import data. This is expected from manual testing, not a deduplication bug. Reset the database and import once if a clean demo state is needed.

## Phase 1 Status

Phase 1 has started as **Multi-platform Import Expansion & Case Quality Workflow**.

Current product shell:

- Dashboard
- Import Center
- Media Library
- Collections placeholder
- Search / Ask placeholder
- Settings / Taxonomy

Near-term Phase 1 priorities:

- Make Import Center a clearer operating workspace
- Support LinkedIn Excel import with a real LinkedIn file as acceptance input
- Add X import after an X Excel file is provided
- Later add case review and quality workflow, such as completeness indicators, missing-field hints, and confirmation status

LinkedIn import baseline:

- One brand per sheet
- Supported fields: `post内容`, `点赞量`, `爆款原因分析-post结构`, `爆款原因分析-post内容`, `爆款原因分析-post视觉效果`, `主视觉参考`, `原帖链接`
- `发布时间` is optional for LinkedIn and may stay empty
- Final acceptance should still use a real LinkedIn workbook

Not included yet:

- Crawlers
- Kimi integration
- Chat / RAG
- Semantic retrieval
- Scheduler / queue infrastructure
- Auth
- Deployment / production infrastructure

## Local Setup

Use Codex bundled Node and bundled pnpm on this machine:

```bash
cp .env.example .env
PATH=/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm install

PATH=/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm prisma:generate
```

If Prisma's schema engine cannot run in a restricted local sandbox, initialize the SQLite tables directly:

```bash
python3 scripts/init_sqlite.py
```

Run local preview:

```bash
PATH=/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm exec next dev -H 127.0.0.1 -p 3001
```

If file watching fails, build and run production preview:

```bash
PATH=/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm build

PATH=/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm exec next start -H 127.0.0.1 -p 3001
```

Open:

- `http://127.0.0.1:3001/`
- `http://127.0.0.1:3001/import`
- `http://127.0.0.1:3001/collect`
- `http://127.0.0.1:3001/library`
- `http://127.0.0.1:3001/collections`
- `http://127.0.0.1:3001/ask`
- `http://127.0.0.1:3001/settings`

## Database Reset

For a clean demo database:

```bash
rm -f prisma/dev.db
python3 scripts/init_sqlite.py
```

Then start the app and import the source Excel once.

## Recent Posts Capture

The `Live Collect` page includes a recent-post capture flow:

- Public paths: YouTube RSS by `UC...` channel ID, Reddit public JSON first with RSS and public HTML fallbacks
- Reddit capture defaults to brand-owned user accounts (`u/...`). Subreddit content (`r/...`) should be used only when the community is confirmed to be officially operated or officially initiated by the brand.
- Instagram path: app backend calls Instagram public web profile data directly, without a user login by default
- X anonymous capture can verify that a public profile page is reachable, but X does not expose the recent timeline in static anonymous HTML. Configure a project-owned `X_BEARER_TOKEN` to fetch recent posts through the official X API. Do not use personal login cookies.
- LinkedIn path: app backend first tries public company pages such as `company/openai` or a company page URL. LinkedIn's official Posts API is practical for owned/authorized organization pages, but not for arbitrary competitor/brand discovery because organization social access normally requires authorization for the target organization. If public HTML is restricted, configure only a project-owned capture account as a server-side fallback; do not ask regular users to log in with personal LinkedIn accounts.

Regular users do not need to install browser plugins or CLI tools, and they do not need to log in with personal social accounts. They only need the app to run in a network environment that can access the target platforms, usually with VPN enabled.

If the browser can access Instagram but the app backend times out, route backend requests through the VPN client's local proxy:

```bash
INSTAGRAM_PROXY_URL=http://127.0.0.1:7890
```

Use your VPN client's actual HTTP proxy port. `ClashX Pro` often uses `7890`, while the current local setup uses `7897`.

If Instagram blocks public anonymous requests and the team explicitly accepts using a server-side fallback account, configure a project-owned capture account in `.env`:

```bash
INSTAGRAM_USE_LOGIN_FALLBACK=true
INSTAGRAM_SESSION_ID=optional-instagram-sessionid
# or
INSTAGRAM_COOKIE='sessionid=...; ds_user_id=...;'
```

Keep `INSTAGRAM_USE_LOGIN_FALLBACK=false` for normal development and public-only capture. Do not use a personal account cookie for shared or deployed versions.

For X recent-post capture, configure a project-owned API token when available:

```bash
X_BEARER_TOKEN=optional-project-x-api-bearer-token
```

For LinkedIn public capture, enter a company slug or URL:

```text
company/openai
https://www.linkedin.com/company/openai/posts/
```

If LinkedIn blocks anonymous public pages and the team explicitly accepts a project-owned server-side fallback account, configure:

```bash
LINKEDIN_USE_LOGIN_FALLBACK=true
LINKEDIN_LI_AT=optional-project-linkedin-li_at
# or
LINKEDIN_COOKIE='li_at=...; JSESSIONID="ajax:...";'
```

Keep `LINKEDIN_USE_LOGIN_FALLBACK=false` for normal development and public-only capture. The fallback account must be a project collection account, not a personal account.

The app normalizes Instagram shortcodes, X status IDs, LinkedIn activity IDs, captions, timestamps, filters to the last 7 days, deduplicates, and can save results as `browser_collect` cases.

## Sample Validation

```bash
PATH=/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm phase0:inspect "/Users/zhongsirui/Downloads/Instagram 社媒高赞内容.xlsx"

PATH=/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH \
/Users/zhongsirui/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm phase0:smoke "/Users/zhongsirui/Downloads/Instagram 社媒高赞内容.xlsx" instagram
```

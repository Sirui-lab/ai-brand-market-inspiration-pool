# Production Deployment

This project is prepared for Railway because the app needs a Node server,
SQLite persistence, and a writable media cache.

## Railway service

Create one Railway web service from this repository.

Required variables:

```env
DATABASE_URL=file:/data/dev.db
MEDIA_CACHE_DIR=/data/media-cache
NODE_ENV=production
```

Create and attach a Railway volume mounted at:

```text
/data
```

On first boot, `scripts/prepare-production-storage.mjs` copies
`prisma/dev.db` into `/data/dev.db` if the production database does not exist.
After that, `/data/dev.db` is the source of truth.

## Social collection credentials

Credentials are project-level server variables. Regular users should not enter
personal social accounts or cookies.

Recommended X setup:

```env
X_BEARER_TOKEN=
```

If no X API bearer token is available, use a dedicated project collector account
as a fallback:

```env
X_AUTH_TOKEN=
X_CT0=
```

How to get the X fallback cookies:

1. Log in to `x.com` with a dedicated project collector account.
2. Open browser developer tools.
3. Go to Application/Storage, then Cookies, then `https://x.com`.
4. Copy the `auth_token` cookie value into `X_AUTH_TOKEN`.
5. Copy the `ct0` cookie value into `X_CT0`.

Do not use a personal account for these values.

Optional fallbacks:

```env
INSTAGRAM_USE_LOGIN_FALLBACK=false
INSTAGRAM_SESSION_ID=
INSTAGRAM_COOKIE=

LINKEDIN_USE_LOGIN_FALLBACK=false
LINKEDIN_LI_AT=
LINKEDIN_COOKIE=

INSTAGRAM_PROXY_URL=
SOCIAL_PROXY_URL=
HTTPS_PROXY=
HTTP_PROXY=
```

## Platform behavior

- YouTube: public RSS/pages, no account needed.
- Reddit: public JSON/RSS/pages, no account needed.
- Instagram: public first; optional project collector fallback.
- X: API bearer token recommended; project collector cookie fallback supported.
- LinkedIn: public company pages first; optional project collector fallback.


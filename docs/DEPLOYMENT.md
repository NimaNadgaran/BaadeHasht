# Deployment and handover

## Architecture decision

The proposal recommends Next.js/Postgres/Prisma/Auth.js/R2. The existing approved site instead uses static HTML/CSS/JS and a dependency-free Node HTTP server. This implementation preserves that frontend and extends the same server with server-rendered public/admin pages and a SQLite backend. It uses Node's Argon2id implementation for passwords. It does **not** claim to be a Next.js/Postgres deployment.

Deploy as **one persistent Node process on a VPS/container**, with durable local storage. There are no runtime npm dependencies or build step. This storage implementation is **not suitable for Vercel/serverless/ephemeral disks or multiple app instances**. Moving there requires a PostgreSQL/object-storage adapter and distributed coordination; R2 and PostgreSQL are not configured or silently emulated here.

## Configuration

Requires Node **24.7+** with `node:sqlite` and `crypto.argon2`. Configuration is loaded from root `.env` if present, or inherited process environment. Never commit `.env`, database files, backups or uploaded private originals. The example is safe to commit and contains no actual keys.

| Variable | Purpose |
| --- | --- |
| `PORT` | Fixed HTTP port; default 5173. Without a fixed port the existing dev fallback tries 5173–5183. |
| `HOST` | Default 127.0.0.1. Use 0.0.0.0 inside a container only with an appropriate firewall/proxy. |
| `SITE_URL` | Exact browser-facing origin, e.g. `https://podcast.example.com`; required in production. No trailing path. Controls reset links, sitemap and CSRF origin checks. |
| `NODE_ENV` | `production` requires HTTPS `SITE_URL`, secure cookies and HSTS. |
| `DATA_DIR` | Durable data path. Default `<repository>/data`. Relative paths resolve against the working directory. |
| `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Required only for `npm run seed`. Exactly one Super Admin is created; reruns do not change credentials. Remove the password after setup. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Required for actual password-reset mail. Verify the sender/domain and SPF/DKIM with Resend. Missing configuration returns a service error. Public recovery acknowledgments remain neutral even if delivery fails (logged server-side), to prevent account enumeration; forced-reset delivery failures are shown to the Super Admin. Tokens are never exposed in logs or returned as a recovery bypass. |


Do not trust arbitrary forwarded host or IP headers: this server uses the configured origin and socket address. Behind a reverse proxy the built-in IP limit is shared by the proxy address; retain it and add per-client-IP limits at the proxy. Account-specific limits also persist in SQLite. Do not make the process directly public without a TLS reverse proxy, request size/time limits and operational monitoring.

## Launch procedure

1. Copy `.env.example` to `.env`, enter strong Super Admin credentials and configure the final origin.
2. Run `npm run seed`, remove the seed password, then `npm start` from the repo root.
3. For a VPS, proxy the HTTPS domain to the loopback Node port with Caddy/nginx. Forward the browser's `Origin` header unchanged. Set upstream body limit at least 8 MiB for encoded uploads; apply rate and timeout limits. Serve static assets through the application or use a narrowly scoped public-asset allowlist, never expose the repo root.
4. Run the service as an unprivileged account with write access only to `DATA_DIR`, and configure restart-on-failure/log rotation. Keep `.git`, `.env`, backend source and data inaccessible to HTTP clients.
5. Configure Resend, then test password reset on a real account and verify email delivery before handing over credentials. Add the six Semi Admin accounts as needed.
6. Enter real guest/episode content, maintain About/team content in `frontend/about.json`, check published/archived boundaries, switch home modes, test disable/re-enable, and verify mobile layouts.
7. Run `npm test`. For browser checks, install Playwright separately and run `node tests/browser.cjs` (optional `PLAYWRIGHT_MODULE`/`BROWSER_CHANNEL`). Tests isolate data in temporary directories and never touch production accounts. Provider tests are mocked; a passing test suite does not confirm live provider credentials, Lighthouse scores or production email delivery.

## Persistence and backups

`DATA_DIR/podcast.sqlite` contains content, settings, admins, hashed session/reset secrets, audit logs and persistent rate-limit counters. Schema initialization is idempotent and the initial schema is versioned with SQLite `user_version=1`. This is a single-process, transactional database. Uploaded files live under `DATA_DIR/media/` with generated names; only accepted raster formats and GLB are served through `/media/`.

**Back up before upgrades:** stop the app, copy the entire `DATA_DIR` (including any SQLite WAL/SHM files), then restart. Retain encrypted off-host backups and test restoration. Restore the directory while the app is stopped; deploy matching application source before restarting. Uploads are public once stored; do not upload sensitive production documents. Deleting a content record does not garbage-collect media; retain files for reference safety and remove unused media only after checking references and backing up.

Audit logs record the actor, action, entity and timestamp, not passwords, raw session/reset tokens, email-provider keys or private notes. Restrict OS access to the data directory and schedule retention/backups appropriate to the team.

## Security controls

- Argon2id: 64 MiB memory, three passes, per-password random salt, constant-time comparison.
- HTTP-only SameSite=Strict cookies, Secure in HTTPS/production, eight-hour server sessions with immediate revocation.
- Every admin read/mutation checks an active account; account creation/enable/disable/forced reset are Super-only. The sole Super Admin cannot be disabled and only six Semi Admin records can exist.
- Exact-origin checks plus CSRF tokens on every mutation, including login, logout, password recovery and uploads.
- SQLite-backed login/reset rate limits survive restarts; upload limits protect provider/storage use.
- Single-use hashed reset tokens, 60-minute expiry, all sessions invalidated on password reset. Force-reset revokes the current password only after the email provider accepts the message.
- Public guest serializers exclude internal production fields. Output is escaped; social links are validated against correct platform domains. Uploads validate content type, signature, size and generated filename; SVG/HTML are rejected.
- Admin pages/API use noindex and no-store headers; public pages are server-rendered and sitemap/robots endpoints are supplied.

Optional TOTP 2FA, Cloudflare R2, Postgres, Figma deliverables, production provisioning and a verified Lighthouse ≥90 report are not included in this repository implementation. None are represented as completed deployments.

## Asset package

- Approved themes: `frontend/shared/themes.css`, `frontend/shared/theme-init.js`.
- Approved home layout/animation: `frontend/home.html`, `frontend/shared/experience.css`, `frontend/shared/experience.js`.
- Branding: `files/images/`; local font/license: `files/fonts/`.
- Editable Blender sources and rendering documentation: `files/blender_files/`.
- Optimized runtime sequences/posters: `frontend/3d_light/frames/`, `frontend/3d_dark/frames/`.
- Admin-managed logo/poster/GLB references and theme overrides: SQLite settings, with uploaded files in `DATA_DIR/media/`.

Keep source assets and runtime assets together at handover. The original animation/frame budget is unchanged, and an uploaded GLB does not replace the approved animation.

# Website Proposal — Podcast Platform

**Project:** Podcast Website with Guest Directory, Video Hub, and Role-Based Admin Panel
**Version:** 1.1 — includes recommended technology stack
**Prepared for:** [Client Name]
**Date:** [Date]

---

## 1. Executive Summary

This proposal covers the design and development of a podcast website built around three pillars:

1. **A public-facing site** — logo, main idea, hero 3D element (Blender), published videos, upcoming videos, a guest directory, and an About Us page for the 7-person team.
2. **A guest & episode management system** — where admins add guests, attach their social/video links, and manage an internal production pipeline from "First Talk" to "Video Uploaded."
3. **A private admin panel at `/admin`** — no public login, role-based access (1 Super Admin + 6 Semi Admins), email-based password reset, and full control over what appears on the home page (automatic or manual video selection).

All content on the public site is driven by the admin panel. Nothing is hard-coded.

**Recommended stack (Section 10):** Next.js (App Router) + TypeScript + Tailwind CSS + PostgreSQL + Prisma + Auth.js + React Three Fiber, deployed on Vercel with Cloudflare R2 for media.

---

## 2. Project Goals

| # | Goal |
|---|------|
| G1 | Give visitors a clear, visual entry point to the podcast (logo + main idea + hero 3D scene) |
| G2 | Showcase published episodes and upcoming episodes, updated without developer involvement |
| G3 | Provide a rich guest directory with 2-column layout and all streaming/social links |
| G4 | Give the team a single internal tool to track episode production stages |
| G5 | Enforce a two-tier admin model where the Super Admin solely controls admin enable/disable and account creation |
| G6 | Keep the public site fast, SEO-friendly, mobile-first, and login-free |

---

## 3. Scope of Work

### 3.1 In Scope

- Public website (Home, Guests, About Us, 404, legal placeholders)
- Hero section with 3D Blender asset integration (asset provided by client)
- Theme system (colors, typography, spacing) applied consistently site-wide
- Admin panel at `/admin` with authentication and role-based permissions
- Guest management (CRUD) with all links and media
- Episode/video management with **Automatic** and **Manual** home-page modes
- Production pipeline table (6 states) — admin-only
- Admin account management (Super Admin only: create, enable/disable)
- Password reset via email for all admins
- Asset package file containing theme, logo, and Blender file references
- Deployment, basic SEO, analytics hookup, documentation, handover

### 3.2 Out of Scope (Phase 2 candidates)

- Public user accounts, comments, ratings, newsletters
- Podcast audio player / RSS feed generation
- Multi-language support
- Payment or membership features
- Native mobile app
- Automated transcription or AI summaries
- Custom CMS beyond what is described here

---

## 4. Site Map & User Flows

```
/                        → Home (logo, main idea, 3D hero, published videos, upcoming videos)
/guests                  → Guest directory (2-column grid)
/about                   → About Us (team of 7)
/admin                   → Admin login (email + password)
/admin/dashboard         → Overview
/admin/guests            → Guest CRUD
/admin/episodes          → Video/episode CRUD + home-page display settings
/admin/pipeline          → Production state table (admin-only)
/admin/admins            → Admin accounts (Super Admin only for create/enable/disable)
/admin/settings          → Logo, theme, Blender asset, hero copy, video mode, team
/admin/forgot-password   → Request reset link
/admin/reset-password    → Set new password via token
```

**Public visitor flow:** Home → (Guests | About Us) → external links (YouTube, Castbox, Spotify, LinkedIn)

**Admin flow:** `/admin` → login → dashboard → manage guests / episodes / pipeline

---

## 5. Public Website Specification

### 5.1 Home Page

| Block | Content | Managed In |
|-------|---------|-----------|
| Header | Logo, nav: Home / Guests / About Us | Settings |
| Hero | Logo, main idea (headline + supporting paragraph), 3D Blender scene (lazy-loaded, static poster fallback) | Settings |
| Published Videos | Grid/list of episodes. **Mode A (Automatic):** latest N videos from the YouTube channel via YouTube Data API v3. **Mode B (Manual):** admin pins specific episodes (e.g., last 4). N is configurable. | Admin → Episodes → Display Settings |
| Upcoming Videos | Scheduled/future episodes with date, title, thumbnail, short description | Admin → Episodes |
| CTA buttons | "Guests" and "About Us" | Fixed |

**Notes**

- Automatic mode is cached (recommended 20–30 min) to stay within YouTube API quota and keep load times fast.
- If the YouTube API is unavailable, the site falls back to the last cached set, then to manual-mode data.
- Hero 3D: implemented with Three.js / React Three Fiber loading a GLB/GLTF exported from the client's Blender file. Budget ≤ 4 MB after Draco/meshopt compression. Poster image shown until loaded; disabled for `prefers-reduced-motion`.

### 5.2 Guests Page (`/guests`)

- **Layout:** 2 columns on desktop and tablet, 1 column on mobile.
- **Each card contains:**
  - Profile picture (consistent aspect ratio, e.g. 1:1 or 4:5)
  - Name + short role/tagline
  - Description (truncated with "read more" if long)
  - LinkedIn link
  - YouTube episode link
  - Castbox link
  - Spotify link
- Links left empty in the admin are **hidden**, never shown as broken buttons.
- Cards ordered by admin-defined sort order (default: newest first).
- Only guests marked **Published** appear here.
- Optional: simple search + alphabet filter (included at no extra cost if kept basic).

### 5.3 About Us Page (`/about`)

- Intro text about the podcast/project
- Team section: 7 members, each with photo, name, role, short bio, LinkedIn link
- Responsive grid, fully managed from the admin panel

### 5.4 Global

- Sticky header with logo and nav
- Footer: social links, copyright, contact email
- Dark/light theme applied consistently (theme tokens defined in Settings)
- Mobile-first responsive design
- 404 page
- Analytics + optional cookie banner

---

## 6. Admin Panel Specification

### 6.1 Access & Authentication

- URL: `/admin` — no public login anywhere else on the site
- Login with email + password
- Passwords hashed with Argon2id (fallback bcrypt)
- Session via secure HTTP-only cookies; sessions invalidated when an admin is disabled
- **Password reset via email for all admins:** tokenized, single-use, expiring link (60 minutes)
- Rate limiting + lockout after repeated failed attempts
- `/admin` disallowed in `robots.txt` and served with `noindex`
- Recommended: optional TOTP 2FA for the Super Admin

### 6.2 Roles & Permissions

| Capability | Super Admin (1) | Semi Admin (6) |
|-----------|:---:|:---:|
| Login, reset own password via email | Yes | Yes |
| Add/edit/delete guests | Yes | Yes |
| Add/edit/delete episodes & upcoming videos | Yes | Yes |
| Change home-page video mode (auto/manual) and count | Yes | Yes |
| Access pipeline table, add plans, change states | Yes | Yes |
| Edit site settings (logo, theme, hero copy, Blender asset) | Yes | Yes |
| Edit team / About Us content | Yes | Yes |
| **Create new admin accounts** | Yes | No |
| **Enable/disable admin accounts** | Yes | No |
| View admin list | Yes | View-only (optional) |

Per the brief, the Super Admin's **exclusive** advantage is creating and enabling/disabling admins. Everything else is shared equally.

**Safeguards**

- The Super Admin cannot disable their own account (prevents lockout).
- At least one active Super Admin must always exist.
- Recommended: audit log of admin actions (who changed what, when).

### 6.3 Dashboard

- Counts: total guests, published guests, upcoming videos, videos in each pipeline state
- Quick actions: Add Guest, Add Episode, Open Pipeline
- Recent activity (if audit log is enabled)

### 6.4 Guest Management

Fields per guest:

- Name, slug (auto-generated, editable)
- Profile photo (upload with crop)
- Short tagline
- Short description (card) and long description (optional detail view)
- LinkedIn URL
- YouTube URL
- Castbox URL
- Spotify URL
- Published / Draft toggle
- Sort order
- Pipeline state (see 6.6)

Validation: URL fields validated for correct domain format; image type/size limits enforced.

### 6.5 Episodes / Videos Management

Fields per episode:

- Title, description
- Thumbnail (auto-pulled from YouTube if available, or manual upload)
- YouTube URL or video ID
- Publish date & time
- Status: Upcoming / Published / Archived
- Optional: linked guest
- "Pin to home page" flag (used in Manual mode)

**Home-page Display Settings**

- Mode: **Automatic** (latest N from YouTube channel) or **Manual** (pinned episodes)
- N: configurable number (default 4)
- Channel ID / handle for automatic mode
- Toggle visibility of the Upcoming section

### 6.6 Production Pipeline Table (Admin-Only)

A table listing every planned guest/episode with an editable state. Admins can add a new row (a "plan") directly from this table.

**States (in order):**

```
First Talk → Scenario → Planned → Tool Video → Video Checked → Video Uploaded
```

- State changed via dropdown or drag-and-drop between columns
- Each row shows: guest name, state, assigned admin (optional), last updated, notes
- Filter by state, search by name
- Color-coded badges per state
- Optional: "time in current state" indicator to spot stalled plans
- Publishing to the public Guests page is a separate action (state ≠ visibility), so internal pipeline states never leak to visitors

### 6.7 Admin Management (Super Admin only)

- List of all admins (name, email, role, status, last login)
- Create new admin (name, email, role, invite email or temporary password)
- Enable / disable toggle
- Force password reset (sends email)
- Cannot disable self; cannot remove the last active Super Admin

### 6.8 Settings

- Site name, tagline, main idea text
- Logo upload (header + favicon)
- Theme tokens: primary/secondary/accent colors, font pairing, corner radius, default mode
- Blender asset upload (GLB/GLTF) + fallback poster image + toggle to enable/disable 3D hero
- Social links (footer)
- YouTube channel ID
- Team members (7): name, role, photo, bio, LinkedIn

---

## 7. Roles & Permissions — Enforcement

- Role-based middleware on every admin API route (not just hidden in UI)
- Disabling an admin immediately invalidates their sessions
- All mutations logged (recommended)
- Password reset tokens hashed at rest, single-use, expiring

---

## 8. Content & Asset Requirements (Client-Side)

| Asset | Format | Needed By |
|-------|--------|-----------|
| Logo | SVG (preferred) + PNG | Design phase |
| Theme selection | Brand colors, fonts, references | Design phase |
| 3D Blender file / exported asset | `.blend` source + `.glb`/`.gltf` export, textures | Development phase |
| Team info (7 people) | Names, roles, bios, photos, LinkedIn URLs | Content phase |
| Guest data | Photos, descriptions, all links | Content phase |
| YouTube channel ID | — | Development phase |
| Domain + hosting access | — | Deployment phase |
| Email sender domain (SPF/DKIM) | — | Development phase |

**Asset package deliverable:** one organized folder containing the theme definition, logo files, and the Blender/3D asset, documented in the handover package.

---

## 9. Data Model (High Level)

| Entity | Key Fields |
|--------|-----------|
| **Admin** | id, name, email, password_hash, role (super/semi), status (active/disabled), last_login, created_at |
| **Guest** | id, name, slug, photo, tagline, short_bio, long_bio, linkedin, youtube, castbox, spotify, pipeline_state, is_published, sort_order, timestamps |
| **Episode** | id, title, description, thumbnail, youtube_id/url, publish_at, status (upcoming/published/archived), is_pinned, guest_id (nullable), timestamps |
| **TeamMember** | id, name, role, photo, bio, linkedin, sort_order |
| **Setting** | key, value (logo, theme JSON, blender asset path, hero copy, video_mode, video_count, channel_id) |
| **PasswordResetToken** | id, admin_id, token_hash, expires_at, used_at |
| **Session** | id, admin_id, expires_at, ip, user_agent |
| **AuditLog** (recommended) | id, admin_id, action, entity, entity_id, timestamp |

The pipeline is a **view over Guest** (`pipeline_state` + a dedicated table UI), so a plan becomes a published guest without duplicate data entry.

---

## 10. Recommended Technology Stack

### 10.1 Recommendation: Next.js Full-Stack Monolith

| Layer | Choice | Purpose |
|-------|--------|---------|
| Framework | **Next.js 15 (App Router) + React 19** | Public site + admin panel in one codebase, SSR/SSG for SEO |
| Language | **TypeScript** | Type-safety across DB, API, and UI |
| Styling | **Tailwind CSS v4** | Fast theme-token-driven styling; theme changes via config |
| UI components | **shadcn/ui** + Radix | Accessible, unstyled-by-default admin tables, dialogs, forms |
| 3D | **Three.js + React Three Fiber + drei** | Loads the exported Blender `.glb` in the hero |
| 3D compression | **Draco / meshopt + KTX2 textures** | Keeps the hero asset under ~4 MB |
| Database | **PostgreSQL** (Neon, Supabase, or RDS) | Relational fit for guests, episodes, pipeline, roles |
| ORM | **Prisma** | Schema, migrations, type-safe queries, seeding |
| Auth | **Auth.js (NextAuth v5), Credentials + database sessions** | `/admin`-only login, role claims, session revocation on disable |
| Password hashing | **Argon2id** (`argon2` package) | Modern password storage |
| Validation | **Zod** | Shared validation for forms and API payloads |
| Forms | **React Hook Form + Zod resolver** | Admin forms (guests, episodes, settings) |
| Tables | **TanStack Table** | Pipeline table, admin list, guest list with filter/sort |
| File uploads | **Presigned uploads to Cloudflare R2** (S3-compatible) | Guest photos, logo, Blender asset |
| Image processing | **Sharp** | Resize/crop/optimize guest photos and thumbnails |
| Email | **Resend + React Email** | Password-reset emails, admin invites |
| Caching | **Next.js ISR + `revalidateTag`** | YouTube data cached 20–30 min with manual "refresh" in admin |
| Rate limiting | **Upstash Redis** (or in-memory for single VPS) | Login attempts, reset-token abuse |
| Deployment | **Vercel (app) + Neon (DB) + Cloudflare R2 (media)** | Zero-ops, preview deploys, global CDN |
| Alternate deploy | **Docker Compose on a VPS** | If you must self-host (Postgres + app + Caddy) |
| Analytics | **Plausible** or **GA4** | Client-provided ID |
| Error monitoring | **Sentry** (optional) | Production error alerts |

### 10.2 Why This Stack for This Project

1. **One repo, one deployment.** The public site and the admin panel share the data model, validation, and UI components. For a 7-admin internal tool this avoids the overhead of a separate backend service.
2. **3D is native.** React Three Fiber is the most mature declarative Three.js layer; the Blender-exported GLB drops into the hero as a component, with proper lazy-loading and fallback handling.
3. **SEO is free.** The Home, Guests, and About pages render on the server with metadata, Open Graph, and sitemap generation — important for a podcast discovery site.
4. **Role enforcement is straightforward.** A single middleware checks the session role (`super` / `semi`) on every `/admin/*` route and every admin API handler, so Semi Admins can never reach create/disable-admin endpoints even by calling the API directly.
5. **YouTube integration is trivial and cached.** A server function fetches the channel feed and stores it in ISR cache; the admin can force-refresh, and the site degrades gracefully if the API quota is hit.
6. **The pipeline table is a normal UI problem.** TanStack Table + shadcn gives sortable/filterable state columns with drag-and-drop without custom infrastructure.
7. **Cheap to host, easy to hand over.** Vercel + Neon + R2 free/low tiers cover launch traffic; the client owns all accounts and can hand the repo to any Next.js developer later.

### 10.3 Alternatives Considered

| Stack | Strengths | Why not the primary choice |
|-------|-----------|---------------------------|
| **Laravel 11 + Inertia + Vue** | Excellent auth scaffolding, queues, mail, Blade admin tools | You'd still add a JS 3D layer; two mental models for one small team; deployment is heavier than Vercel |
| **Django + HTMX** | Batteries-included admin, strong ORM | Django admin needs heavy customization for the 6-state pipeline + two-tier roles; weakest option for an interactive 3D/React frontend |
| **Nuxt 3 + Directus/Payload CMS** | Great Vue DX; headless CMS speeds content | Extra moving part (separate CMS) for content that is mostly custom pipeline logic; CMS licensing/ops overhead |
| **Astro + Svelte islands + separate API** | Superb static performance | The admin panel is highly interactive; you'd rebuild a React-like SPA anyway, and split the codebase |
| **WordPress + ACF + custom plugin** | Familiar to non-devs, cheap hosting | Pipeline table, two-tier admin model, and YouTube auto-mode would all be custom plugins; 3D hero is awkward; security surface larger |
| **Webflow/Framer + Airtable** | Fastest visual launch | Cannot model role-based admin, password reset, or a server-enforced pipeline; not maintainable long-term |

### 10.4 Notes on Specific Decisions

- **Why database sessions instead of JWT-only:** disabling a Semi Admin must take effect immediately. With DB sessions, deleting their session rows on disable logs them out instantly.
- **Why R2 instead of Vercel Blob:** R2 has no egress fees and is S3-compatible, so migration to AWS later is trivial.
- **Why not Supabase Auth:** the role model (exactly 1 Super Admin + 6 Semi Admins, Super-only admin management) is small and custom; Auth.js gives full control over the disable/enable flow and reset tokens without vendor lock-in. Supabase remains a fine alternative if you prefer a managed auth + storage bundle.
- **Why Postgres over MongoDB:** guests, episodes, pipeline states, and roles are naturally relational; foreign keys (episode → guest) and migrations matter here.

---

## 11. Design & Branding

- Modern, content-forward podcast aesthetic; generous whitespace; strong typography
- **Theme system:** colors, fonts, and radius defined as design tokens in Settings, so the site can be re-skinned without code changes
- Dark mode as the primary mode (typical for podcast/video brands), light mode available
- Responsive breakpoints: mobile, tablet, desktop, wide
- Accessibility: WCAG 2.1 AA targets — contrast, keyboard navigation, alt text, focus states
- Deliverables: Figma file with Home, Guests, About, Admin login, Admin dashboard

---

## 12. Non-Functional Requirements

| Area | Requirement |
|------|------------|
| Performance | Lighthouse ≥ 90 (mobile) for public pages; 3D asset ≤ 4 MB, lazy-loaded |
| SEO | SSR/SSG, meta tags, Open Graph, sitemap.xml, clean URLs, semantic HTML |
| Security | HTTPS, Argon2id hashing, CSRF protection, rate limiting, input validation, no `/admin` indexing |
| Reliability | YouTube API fallback caching; graceful degradation of 3D hero |
| Maintainability | Documented code, env variables, seed script, README |
| Analytics | GA4 / Plausible hookup (client provides ID) |

---

## 13. Deliverables

1. Fully deployed public website
2. Fully functional admin panel at `/admin`
3. Seeded Super Admin account + ability to create the 6 Semi Admins
4. **Asset package:** theme definition, logo files, Blender/3D asset (+ fallback poster), organized and documented
5. Figma design file
6. Source code in a client-owned Git repository with CI (lint, typecheck, build)
7. Admin user guide (Markdown/PDF): adding guests, managing pipeline, switching video mode, resetting passwords
8. Deployment & environment documentation (Vercel + Neon + R2 setup, or Docker Compose)
9. 30-day post-launch bug-fix support

---

## 14. Timeline & Milestones

| Phase | Duration | Output |
|-------|----------|--------|
| 1. Discovery & Design | Week 1–2 | Sitemap confirmed, wireframes, Figma UI, theme tokens |
| 2. Foundation | Week 2–3 | Repo, Prisma schema + migrations, Auth.js setup, role middleware, layout/header/footer |
| 3. Public Pages | Week 3–5 | Home (incl. 3D hero), Guests, About Us, responsive + SEO |
| 4. Admin Panel | Week 4–6 | Guest CRUD, Episode CRUD, video-mode settings, pipeline table, admin management, password reset |
| 5. Integration & QA | Week 6–7 | YouTube API + ISR caching, Resend email, R2 uploads, 3D optimization, cross-browser/mobile testing, security review |
| 6. Launch & Handover | Week 7–8 | Deployment, content seeding, documentation, training session |

**Estimated effort:** ~35–45 person-days depending on final scope of guest search/filter and audit log.
**Target launch:** 6–8 weeks from kickoff, assuming client assets are delivered on schedule.

---

## 15. Assumptions

- Client provides all content (guests, team, copy) and owns all accounts (domain, hosting, YouTube, email sender).
- One language (English) at launch.
- The 3D Blender asset will be delivered as an exported `.glb`/`.gltf`; if only a `.blend` is provided, export/optimization is included once.
- YouTube videos are public and accessible via the YouTube Data API.
- Castbox and Spotify links are per-episode URLs entered manually by admins (not API-integrated).
- No public user accounts or login.
- The 6 Semi Admins are created by the Super Admin after launch.

---

## 16. Open Questions (to confirm before kickoff)

1. Should each guest have a **dedicated detail page** (`/guests/[slug]`), or is the card on `/guests` sufficient? (Detail page recommended; low cost.)
2. Are guests and episodes **one-to-one** (each guest = one episode) or can a guest appear in multiple episodes?
3. In **Automatic** video mode, should it pull from a single YouTube channel/playlist, and should Shorts be excluded?
4. Should **Semi Admins** also be blocked from editing site Settings, or is shared access as described acceptable?
5. Do you want an **audit log** of admin actions? (Recommended; small added effort.)
6. Preferred **hosting** — Vercel/Neon (recommended) or your own VPS with Docker?
7. Should the **Upcoming Videos** section be publicly visible, or only a count/teaser?
8. Is **2FA** for the Super Admin desired?

---

## 17. Acceptance Criteria

- Public pages render correctly on mobile, tablet, and desktop with all content coming from the admin panel.
- The Guests page displays exactly 2 columns on desktop with all six card elements (photo, LinkedIn, description, YouTube, Castbox, Spotify) and hides missing links.
- The home page correctly switches between Automatic (latest N from YouTube) and Manual (pinned) modes, with the setting saved persistently.
- `/admin` is the only login entry point and is not indexed.
- Super Admin can create and enable/disable admins; Semi Admins cannot see or use those controls (enforced server-side).
- All admins can reset their password via a working email link.
- The pipeline table supports adding plans and moving them through all six states.
- The asset package (theme, logo, Blender file) is delivered and documented.
- Lighthouse mobile performance ≥ 90 on Home, Guests, and About.

---

## 18. Commercials

| Item | Notes | Estimate |
|------|-------|----------|
| Design (Figma, public pages + admin) | — | [X] |
| Public website development | Home, Guests, About, 3D hero | [X] |
| Admin panel development | Auth, roles, CRUD, pipeline, settings | [X] |
| Integrations | YouTube API, Resend email, R2 storage | [X] |
| QA, deployment, documentation, handover | — | [X] |
| **Total** | — | **[X]** |
| Optional: audit log | — | [X] |
| Optional: guest search/filter | — | [X] |
| Optional: 2FA for Super Admin | — | [X] |
| Post-launch support | 30 days included; retainer available | [X]/mo |
| Hosting (client-owned) | Vercel Pro + Neon + R2 — typical launch cost | ~$20–40/mo |

*Pricing to be finalized after the open questions in Section 16 are resolved.*

---

**Next steps:** confirm answers to Section 16 → sign-off on scope → kickoff with design phase and asset collection.
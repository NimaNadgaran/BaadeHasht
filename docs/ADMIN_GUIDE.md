# BaadeHasht admin guide

## Access

Open `/admin` directly. There is intentionally no public login link. Use the email and password created during setup. Sessions expire after eight hours; logout invalidates the current session immediately. Never share credentials.

The Super Admin creates up to six Semi Admin accounts from **مدیران**. Set a strong temporary password and deliver it through a private channel, or use **ارسال بازیابی گذرواژه** after creating the account. Force reset sends a link, invalidates the current password and logs that account out. Disabling an account revokes all its sessions and reset links immediately. Enabling it again does not revive old sessions. The sole Super Admin cannot be disabled or replaced through the UI.

Both roles can manage guests, episodes and production. Semi Admins can view the admin list, but account creation, enable/disable and forced resets are enforced as Super-only on the server as well as in the interface. There are no Settings or Team sections or admin APIs.

## Guests and production

1. In **مهمان‌ها**, click **افزودن**. Enter a name; a slug is generated if left empty.
2. Add a photo, tagline, descriptions, and any LinkedIn/YouTube/Castbox/Spotify links. Empty links are hidden publicly. Only HTTPS links on the relevant platforms are accepted.
3. Photos upload directly from the editor and are centre-cropped to a square and resized to at most 1200 pixels. Image uploads accept PNG/JPEG/WebP up to 5 MiB. Save the form after an upload to attach the file.
4. Use **انتشار عمومی** to publish the profile. Sort order is ascending, then newest first for ties. Drafts never appear in the public directory or sitemap.
5. The **روند تولید** table operates on the same guest record: First Talk → Scenario → Planned → Tool Video → Video Checked → Video Uploaded. A new plan starts as a draft guest, so no duplicate entry is needed.
6. Assign an active admin, add private notes, filter/search, or change the state. Pipeline state, assignments and notes are excluded from public data.

Finishing production does **not** publish a guest. Publishing is a separate action. Deleting a guest unlinks their episodes instead of deleting the episodes.

## Episodes and the home page

In **ویدیوها**, enter the title, description, YouTube link or 11-character ID, publish time (**UTC**), status and optional guest. Multiple episodes can link to one guest. A thumbnail is taken from YouTube if no image is supplied; uploaded episode thumbnails are cropped to 16:9.

- **Published:** requires a YouTube video; visible only after its publish time.
- **Archived:** hidden publicly.
- **Manual home mode:** only published, due, pinned episodes are selected, newest first, up to the configured count (1–24; default 4).
- **Automatic mode:** the latest published episodes are selected automatically, newest first, up to the configured count (1–24; default 4).

No public audio player, RSS generation or public accounts are included, in line with Phase 1 scope.

## Frontend-managed content

About copy and team members are maintained in `frontend/about.json`. Edit `title` and `paragraphs` for the introduction on `/about`. The About page links to the separate `/team` page, titled **تیم پشت صحنه**; it does not display member cards inline. The `team` array contains members in display order, with `name`, `photo`, `role`, `bio` and optional LinkedIn/YouTube/Castbox/Spotify links. Existing uploaded photo URLs can still be used. Restart the server after editing the file.

The header logo is `files/images/logo_transparent.png`. Settings and Team pages and their admin read/write endpoints are removed. Video display preferences remain in **ویدیوها**; they cannot change About copy, team members or branding.

Legal pages remain placeholders until reviewed copy is configured in the source. The existing frontend layout and Blender intro/light loop are unchanged.

## Password recovery

Use **گذرواژه را فراموش کرده‌اید؟** at `/admin`. The screen never reveals whether an email address exists. A configured, working Resend sender is required. Reset links are single-use, expire in 60 minutes, and revoke all account sessions when consumed. A new reset request replaces the previous link. Rate limiting applies to login and recovery requests. If locked out, wait for the limit window; restarting does not clear limits.

For disabled accounts, ask the Super Admin to enable them first. For email delivery problems, contact the server operator; there is no insecure public recovery bypass.

# Exomusica — architecture

## Stack (decided, not up for debate unless you object)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite, client-side router | The persistent audio player and "no reload on nav" requirement are only clean as an SPA. Anything server-rendered with full page loads fights this from day one. |
| Global audio state | Zustand (or React Context if you want zero deps) | Lives above the router, survives route changes, holds current track/queue/position. |
| Backend | Fastify + TypeScript | Lighter than Express, native WebSocket plugin, good throughput for a single-VPS deployment. |
| DB | PostgreSQL + Prisma | Relational model fits this data (branches, messages, reactions, albums) far better than a document store. Prisma gets you migrations + types for free. |
| Realtime chat | Raw WebSocket, one room per forum channel | Socket.io is overkill for a single-process, single-VPS deployment — plain `ws` is enough and has zero extra protocol overhead. If you ever run multiple backend instances, you'll need a Redis pub/sub adapter to fan out across processes; not needed at this scale. |
| Search (archive string search) | Postgres full-text search (`tsvector`) on `Message.contentRaw` | No need for Elasticsearch/Meilisearch at this scale; one GIN index gets you fast search across all archived days. |
| File storage | Local disk volume, quota tracked in `User.storageUsedBytes` | 65MB/user is small — object storage (S3) is unjustified complexity. Enforce quota in app code at upload time, not via filesystem quotas. |
| Reverse proxy / TLS | Caddy | Automatic HTTPS with zero certbot ceremony. Swap for nginx if you already run nginx elsewhere. |
| Deployment | Docker Compose on your VPS | One `docker compose up -d`, one `.env` file, easy to redeploy. |

## Two things in your spec that need a direct answer, not a workaround pretending they don't exist

**1. "Links create embeds, always fetched by the user, not the server" — this doesn't work for arbitrary URLs.**
Browsers block cross-origin `fetch()` of a page's HTML/meta tags unless that server sends permissive CORS headers, and almost none do. Two real options, not one:
- **oEmbed** for sites that support it (YouTube, SoundCloud, Bandcamp, Spotify, Vimeo) — their oEmbed endpoints *are* CORS-open by design, because embedding is the point. This covers most of what people will actually paste into a music forum.
- **Manual embed fallback** for everything else (including plain archive.org links): the poster fills in title/thumbnail/URL themselves, or the client renders a plain link card with no fetched metadata at all.
- A server-side fetch-and-cache proxy is the only way to get *universal* rich previews, and it's exactly what you said you didn't want (server visits the link, not the user). I'm respecting that constraint — it just means previews won't be universal.

**2. Global incrementing message ID + backfilling old Discord history breaks chronological ID order.**
Your spec (rightly) wants one global, incrementing ID across the whole site so any message is linkable. But if you import Discord history *after* the forum has been live a while, those old messages get *new, higher* IDs despite being *chronologically older*. The IDs stay unique and stay incrementing — they just stop meaning "older = lower ID" once you backfill. Not a blocker, just something to know: don't build any feature (sorting, "next message" links) that assumes ID order == time order across an import boundary. `dayKey` (real timestamp) is always the source of truth for ordering and archiving; `id` is only for direct linking.

## Discord import — yes, this works

1. Export the channel(s) with **DiscordChatExporter** in CSV mode (author, timestamp, content, attachments, reactions).
2. For every distinct Discord author in the CSV with no matching real Exomusica account, create a `User` row with `isGhost = true`, download their Discord avatar into `avatarUrl`, and generate a `claimToken`.
3. **Claim mechanic (worth adding, wasn't in your spec but solves an obvious problem):** if that person later joins Exomusica for real, your admin panel can attach their new account to the existing ghost account via the claim token instead of creating a duplicate — so their imported history becomes genuinely theirs instead of orphaned.
4. Importer script inserts `Message` rows with `createdAt` set to the *original* Discord timestamp, `dayKey` computed from that timestamp (so it lands in the correct archived day automatically — no special-casing needed, the archive view just groups by `dayKey`), and `importedFrom = "discord:<original_id>"` for traceability.
5. Reactions and replies from the CSV map to `Reaction` and `replyToId` the same way — replies need a lookup table from Discord message ID → new Exomusica `Message.id` built during the same import pass, since IDs won't match.

## Decisions locked in since Phase 0

- **Discord import ID gap**: accepted as-is. Imported messages get new, higher ids than their (older) timestamp implies — confirmed fine, `dayKey` stays the ordering/archiving source of truth, not `id`.
- **Account deletion**: real accounts are never hard-deleted. Deleting (self-service or admin) flips `isGhost = true`, `ghostReason = ACCOUNT_DELETED`, clears `email`/`passwordHash`/`bio`/`links`, and stamps `deletedAt`. The `User` row — and every message it authored — stays exactly where it was. This reuses the same `isGhost` flag as Discord-import placeholders, distinguished by `ghostReason`, so message attribution code never needs to care which kind of ghost it's looking at.
- **Embeds**: deferred, unchanged from the Phase 0 write-up above.

## Audio compatibility (why the forum backend won't need rework later)

Persistence-across-navigation is entirely a frontend concern — a global store living above the router — and nothing about building the forum backend first touches it either way.

The one real coupling point: a forum message can reference a track (`track:42`, or a pasted `/t/42` link), and when that happens the message API resolves it server-side and hands back a `PlayableTrackDTO` (see `lib/types.ts`) — the *exact same shape* the Music pages will use once Albums/Tracks get their own CRUD in Phase 3. The frontend audio store only ever needs to understand one shape, regardless of whether a track was handed to it from a forum embed, an album page, or (later) search results. `lib/embeds.ts` does the resolution; `messageDto.ts` attaches the result as `MessageDTO.embeds`.

## What's built now (Phase 0 + forum backend + Phase 1 frontend shell + admin UI)

Everything from before, plus:

- **Frontend scaffold**: Vite + React + TS + React Router, `AuthProvider` (JWT in localStorage), a typed `api()` fetch wrapper.
- **Persistent audio player**: `useAudioStore` (Zustand) holds player state; the actual `<audio>` element lives once in `PlayerBar`, mounted inside `Layout` next to `<Outlet/>` rather than inside it — that placement is the entire mechanism. `Layout` never remounts on route change, so the element (and playback) survives navigation with no special-case code.
- **Homepage tree**: radial layout computed from `Branch.parentId`/`posX`/`posY` (`lib/treeLayout.ts`), rendered as SVG with bezier branch paths. Hover/tap lazy-loads a two-half card — forum preview via the existing messages endpoint, music preview via the new `/api/branches/:slug/albums` — using real DOM measurement to position the card, not raw SVG coordinates (those don't match once the SVG scales to its container).
- **Message formatting**: full renderer for the Discord-style syntax — bold/italic/underline/strikethrough/code/spoiler (click-to-reveal)/links/`<t:UNIX>`/headers/subtitles/quotes. Mentions and channel refs render with their raw id for now; resolving them to names needs a bulk id→name lookup that doesn't exist yet.
- **Branch pages** (`/branch/:slug`): album grid (Music) + the branch's live forum topic in one page, matching what the homepage hover card already previews.
- **Admin UI**: join request approve/reject, branch creation (with parent-branch picker), Discussion topic creation, and single-user lookup-by-username with a ghost button. No user *directory* yet — there's no list-all-users endpoint, so moderation is exact-username lookup only until that's worth building.
- **New backend reads added to support the above**: `GET /api/branches/:slug`, `GET /api/branches/:slug/albums` (album + first-track preview, reusing the same `trackToDTO` mapping as message embeds — same shape, same code path, exactly the compatibility guarantee from before), `GET /api/channels?kind=`, `GET /api/collaborators`.

## Verification note, updated

The frontend build is fully clean — `npm run build` (which runs `tsc --noEmit` first) passes with zero errors, since it only depends on the npm registry, not a binary fetch like Prisma's. That's a real, complete check, not a caveated one.

The backend still carries the same ~16 Prisma-generation-cascade errors described above, for the same reason (`binaries.prisma.sh` blocked in this sandbox). Unchanged advice: run `npm install && npx prisma generate && npx tsc --noEmit` yourself before trusting it.

Caught during this pass, fixed before it shipped: the hover card was originally positioned using the SVG's viewBox coordinates directly, which only line up with the actual node position if the SVG is rendered at exactly its viewBox size — it isn't, since it scales responsively. Fixed by measuring the node's real bounding box instead. Also caught: `PlayerBar`'s "now playing" link pointed at a per-album page route that isn't built (that's Phase 3) — pointed it at the branch page instead, which exists and shows the same album.

## What's built now (+ Discord import, message attachments, email, collaborator picker, user directory)

Everything from before, plus:

- **Discord CSV importer** (`backend/src/import-discord.ts`), built and tested against a real export from your server, not a hypothetical format. Handles: multi-line quoted content (the CSV format genuinely has messages spanning several lines inside one quoted field), 7-digit .NET-style fractional timestamps (truncated to milliseconds before parsing — JS's Date constructor doesn't reliably handle 7 digits), a best-effort system-message filter ("Pinned a message.", etc.), and multi-attachment messages (your own sample had a 3-image message). Idempotent via a new `discordId` field on `User` plus a natural-key dedup on (channel, author, timestamp, content) — this CSV format has no per-message id to key on directly. **Not carried over, because the format doesn't have it**: reply-chains and reactions (Discord's CSV export has no message-id or reply-reference column, and its reactions are standard Unicode emoji, a different system entirely from the custom-image `CustomEmoji` model here — importing them would mean building a second, parallel emoji system just for this).
- **Message attachments, for real now**: `Message`↔`Attachment` was upgraded from a 1:1 relation to 1:many (it had to be — see above). Live uploads go through `POST /api/attachments` (quota-checked against the 65MB limit) then get linked at message-creation time; the Discord importer bypasses the quota check (bulk historical backfill isn't the same thing as someone live-uploading) but still updates `storageUsedBytes` for accurate accounting.
- **Bare-URL auto-linking** in the message formatter — added because your sample content had a plain `https://` URL with no markdown around it, which the formatter previously wouldn't have touched.
- **Email**, wired to three places: PM notifications (fires on send if the recipient opted in), a blog "notify subscribers" admin action, and a `weeklySummary.ts` script meant for an external cron (see `DEPLOYMENT.md`) rather than an in-process scheduler — a whole scheduling dependency isn't worth it for something that runs once a week. All credentials come from `backend/.env` only; nothing is hardcoded, and I never saw or asked for your actual SMTP password.
- **Pick-existing-collaborator**: the admin album form now lists existing collaborators in a dropdown, with a toggle to create a new one instead — no longer forced to create a duplicate every time.
- **Real user directory**: `GET /api/admin/users?q=` (partial match) replaces the old exact-username-only lookup.

## Discord bridge bot — design note, not built

You floated a future realtime bridge: forum messages copied to Discord, Discord messages copied to the forum, while the Discord server still exists. Not building this now — no bot token was provided, and it's explicitly a "for later" idea — but worth confirming the current design already supports it without rework:

- **Discord → forum** direction: this is exactly what the CSV importer does in batch. A live version would be a small bot process listening to Discord's gateway (or a webhook), calling the same `POST /api/channels/:slug/messages` endpoint per incoming message, using `findOrCreateGhostUser` keyed on `discordId` (already built, already idempotent) instead of creating one per CSV row.
- **Forum → Discord** direction: the bot would subscribe to the same `ws://<host>/ws/:channelSlug` this app's own frontend uses, and repost each `message.create` event to the matching Discord channel via a webhook.
- **The ID question you raised**: already true today — `Message.id` is a single global autoincrement, `importedFrom` carries the Discord provenance string. A live bridge wouldn't need to (and shouldn't try to) make forum IDs match Discord's snowflakes; it only needs the mapping to be lookupable, which `discordId` (for users) and `importedFrom` (for messages) already are.
- What a real build would need beyond this: a Discord bot application + token (in the Developer Portal), the bot invited to the server with message-read/webhook permissions, and a small always-on process (could live as another Docker service in `docker-compose.yml`) — none of which exists yet.

## Recap: what the pass before this one built (albums/wiki/blog/PMs/emoji)

- **Albums (write side)**: admin can create albums under a branch, add tracks, create collaborators and link them to albums. Public `GET /api/albums/:slug` and an `AlbumPage` show the result — cover, description, stream/download links, track list with playback, collaborator cards.
- **Wiki**: nested pages (`parentId`), admin create/edit, public list + single-page view rendered through a small custom markdown renderer (`lib/markdown.tsx` — headers, bold/italic, links, flat bullet lists; not full CommonMark, no nested lists or tables, on purpose — that's more machinery than these pages need right now).
- **Blog + newsletter**: admin create/publish/unpublish, public list + single-post view, newsletter signup form. Subscription capture and actual sending were separate steps when this was written — sending is wired up now, see "Email" above.
- **PMs**: conversation list, thread view, send — grouped in JS rather than SQL since per-user conversation counts are small. Notification preference toggles work (`PATCH /api/account/notifications`); the email they trigger wasn't sending when this was written — it is now, see "Email" above.
- **Account settings**: self-view (`/api/account/me`, includes email unlike the public profile), password change, self-delete (routes through the same `ghostifyUser()` as admin moderation).
- **Public profile pages** (`/u/:username`) with a Message button, closing the loop into PMs.
- **Emoji system, end to end**: admin bulk upload (multipart, one or many PNG/BMP files in one request, deduplicated names), served via `@fastify/static` under `/uploads/`, a shared `EmojiPicker` component used for *both* the composer's `:name:` autocomplete and — closing a gap flagged last pass — actually adding a reaction to a message (the API existed, nothing created one). Message rendering resolves `:name:` against the emoji cache; unknown names render as literal text rather than breaking.
- **Seed script** (`backend/src/seed.ts`): creates the bootstrap admin account — solves the real chicken-and-egg problem where nothing can ever approve a join request without an admin existing first — plus example branch/album/discussion-thread/wiki-page/blog-post content, idempotent (safe to re-run).
- **Missing backend Dockerfile, found and fixed**: `docker-compose.yml` referenced `backend/Dockerfile`, which had never actually been created. `docker compose up` would have failed immediately on a fresh clone. It's a standard multi-stage build now (compile + `prisma generate`, then a lean runtime image).
- **Deployment guide** (`DEPLOYMENT.md`): exact commands for getting this onto a VPS, including the one genuinely non-obvious step — generating the first Prisma migration with the prisma folder bind-mounted, so the generated SQL lands on the host disk and gets committed to git, rather than vanishing inside a container layer on the next rebuild.

## Two bugs caught mid-build this pass, not shipped

1. The emoji store's `load()` had a "load once" guard (correct for the composer/renderer, which just need the list available). Reusing it after an upload or delete would have silently no-op'd — the admin panel's list would never refresh. Split into `load()` (once) and `refresh()` (always), used in the right places.
2. The shared `api()` fetch wrapper unconditionally set `Content-Type: application/json` whenever a body was present. That's wrong for `FormData` — it needs the browser to set its own multipart boundary header — and would have silently broken emoji upload. Fixed to skip that header for `FormData` bodies.

Also: BMP files get reported with inconsistent mimetypes across browsers (`image/bmp` vs `image/x-ms-bmp`). The upload validator now falls back to the file extension when the mimetype doesn't match either, instead of rejecting a legitimate BMP.

## Verification, updated again

Frontend: `npm run build` is still fully clean after all of the above — zero errors. Backend: same ~16-error Prisma-generation cascade as every prior check, confirmed unchanged (same root cause, `binaries.prisma.sh` blocked in this sandbox) — nothing new introduced by this pass's routes. Still the same standing advice: run `npm install && npx prisma generate && npx tsc --noEmit` yourself before trusting the backend fully; the frontend check *is* trustworthy as-is.

## Not built yet

- Confirmation/double-opt-in for newsletter subscriptions — `notify-subscribers` currently emails every row regardless of the unused `confirmed` field
- A "claim this ghost account" UI for Discord-imported users who join for real (the `claimToken` field exists for exactly this; nothing reads it yet)
- Edit forms for albums/wiki pages/blog posts after creation (the `PATCH` endpoints exist; only creation has a form)
- Any update endpoint at all for branches (not just a missing form — the route itself doesn't exist)
- Track reordering within an album, and a UI for the tree's `posX`/`posY` node positions (both are direct-database-edit only right now)
- Mention/channel-ref name resolution (renders raw ids)
- Full CommonMark for wiki/blog (current renderer is intentionally minimal — see above)
- The live Discord bridge bot itself (see the design note above — the groundwork is in place, the bot process isn't)

## Open question you haven't decided yet
What happens to a user's messages if their account is deleted — keep them attributed, or anonymize ("deleted user")? **Answered**: keep attributed via ghost account, see above.


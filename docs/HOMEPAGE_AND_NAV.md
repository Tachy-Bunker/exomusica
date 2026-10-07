# Homepage and navigation

## Header
`⩽ EXOMUSICA ⪖` is centered. Left of it: **Soundbay** (music) and **XenoLab** (research). Right of it: **Telemetry** (community) and **Log** (wiki and news).
Tools (bell, messages, account, donate) are at the far right; the presence orbs at the far left. The current section is highlighted (`lib/navSections.ts`).

| Section | Address | What it is |
|---|---|---|
| Soundbay | `/soundbay` | Branches, growing seeds, playlists and community albums as compact rows with search, sort, filters, a section jump bar and previews; the way to the map and the player (`/listen`) |
| XenoLab | `/xenolab` | A calm page: a Start-a-study bar and three small cards: Research (knowledge: recent studies, the Log), Audio processing (tool: Voice lab) and Analysis (tool: analyze a clip, import labels, and a collapsible chart tool) |
| Telemetry | `/telemetry` | The community hub: **Conversations** (`/conversations`), **Members** (`/members`), the conversation map, challenges, sample bank, contribute, cult activities, messages; recent chat |
| Log | `/wiki` | One explorer for the wiki and the news: News is a folder of posts, wiki pages nest to any depth (`pages/LogPage.tsx`, `lib/logTree.ts`). `/wiki/...` and `/news/...` keep working |

Old addresses redirect: `/research` to `/xenolab`, `/log` and `/about` to `/wiki`.

**Shortcuts** (desktop, not while typing, and not while a dialog or the full-screen map is open): `B` Soundbay, `X` XenoLab, `M` Telemetry, `G` Log, `C` home. Only shortcuts that are shown (the underlined letters) exist. The letters avoid `W A S D E F T R` (maps and returning from a page) and `L P` (the player). `R` returns from a page: branch page to Soundbay, topic page to Conversations, album page to its branch.
Below 1320 px the Admin link becomes a gear. Phones get two rows (brand, then the four links). On the homepage the brand itself is highlighted.

## Homepage (`/`)
Order: hero ("Alien sonic worlds", Listen now and a way to join), **Explore the branches**, **Happening now**, then the join band (visitors) or **Your work** (members). A member's welcome has only a "New message" chip when there is one.
The whole page is one request, `GET /api/home` (public data only, cached 30 s server-side, shared client-side with Soundbay and Telemetry for 20 s). Members' own studies are one extra request after the page has appeared.

**Explore** (`components/HomeExplore.tsx`, `lib/branchGrid.ts`): every branch is a tile on a procedural grid that is bigger than the window showing it. Choosing a tile, shuffling, or the 7-second introduction sends a camera travelling to it (exponential approach: fast when far, gentle on arrival, frame-rate independent; a jump for "reduce motion"). Keyboard focus on a tile selects it, so the camera follows. The card beside the grid has the branch's picture, description and activity, a shuffle button (the player's icon), a play button (icon only: plays a shuffle of that branch) and Open branch. **Full screen** is in the window's bottom-left corner and opens the real interactive map (loaded only then); `/?map=full` opens it directly, `/?branch=slug` chooses a branch. Whatever starts playing, the grid travels to its branch and shows "Playing now"; the listener can shuffle on from there.

**Happening now** cards carry an icon per kind (`components/ActivityIcons.tsx`): chat, album, study, update, challenge, new member.

## Who sees what (`backend/src/lib/publicChannels.ts`)
Topics are public. A branch's chat is public unless the branch is `HIDDEN`. `GET /api/home` and `GET /api/recent-messages` apply this rule in the query *and* again in code.
Members counted and shown are real accounts only (no ghosts, no deleted accounts).

**Hidden branches are unlisted, not private (decided).** They never appear in lists, feeds, the homepage or the Conversations hub, but the branch and its chat open for anyone who has the link. `GET /api/channels/:slug/messages` therefore deliberately has no visibility check.

## Join requests (`backend/src/lib/joinRules.ts`, `routes/join.ts`)
Usernames and emails are compared ignoring case and spaces. A request is refused if a pending request or a real account already has that username or email
(ghost usernames are allowed: claiming one is an admin decision). The check and the save happen under a lock per name and per email, so two simultaneous
requests can't both be saved. The messages about emails don't reveal whether an account exists. Approving a request rejects its pending repeats; approval of a request
whose email already has an account is a clear 409. The form sends once, however many clicks, and drops whitespace as you type. No schema change.

## Conversations hub (`/conversations`)
One cached request, `GET /api/conversations` (30 s). Every public chat is a card: kind (branch, topic, study chat, question), the last message, messages this week,
distinct voices in 30 days, the total, and a signal level (0 dormant to 4 busy: nothing for 30+ days, quiet, 1-4, 5-19, 20+ messages this week). A chat active in the last hour has a pulsing beacon.
Study chats list their studies as links. Search ignores case and accents and needs every word (it also looks in the category, the branch name, the description and study titles);
filters and sort are in the address (`?kind=study&sort=busy&q=...`). Logged-in members also see "N here now" per chat and "N in chat now" (presence only knows who is viewing a chat).
The queries live in `lib/conversationSql.ts` and were run against a real Postgres, including under different server timezones (every time window is anchored to UTC, because Prisma stores times without a zone).

## Members directory (`/members`)
`GET /api/members` (60 s): real accounts only (no ghosts, no deleted accounts), with exactly what a public profile shows (name, picture, bio, join month) plus studies owned and
messages written in the last 30 days in public chats. 60 cards at a time. Filters: new this month, active this month, in chat now (only when presence data exists). Members get a Message
button (to `/pms/<name>`) on everyone but themselves; visitors are told to log in. A member without a picture gets their first letter on a colour taken from their name.

## Performance notes
Both hubs are one request each; cards far off-screen are not rendered (`content-visibility`); the starfield is a tiny tiled CSS pattern; the only animation is the beacon,
which stops for people who prefer reduced motion.

## Not built yet
Unread counts per conversation, hover cards on names in chat (Profile / Message), the Music and Research hubs' deeper pages.


## Soundbay (`/soundbay`)
Sticky toolbar: search (branches, playlists and albums), sort (most recently active, A to Z, most albums), filters (active this month, has a discussion, has albums), and a jump bar with live counts per section. Filter chips everywhere on the site are dim until chosen and light up when hovered. All of it is in the address.
A branch is a compact row: emblem (or its logo picture), name, description, album count, and a dimmed "active X ago", with Open, Discussion (the chat dock on desktop, with the chat icon) and Map. **The whole row is the toggle**: a real button sits under the text and links, so clicking anywhere that isn't a link or button opens the preview, and Space or Enter does it from the keyboard (no Preview button). Hovering any row or button lights its edge. A branch that is **playing** is marked "Playing now" and pinned to the top of its list while it plays.
A preview shows the description, its albums (fetched only when first opened) and up to three pictures on the right (its cover, then album covers). "Shuffle everything" is an icon.

## Branch identity (admin)
`/admin/branches/:id/identity` (an "Identity" button on each branch): one accent colour (12 suggestions or any `#rrggbb`), one emblem (8), and optionally a **logo picture** that replaces the emblem: the branch's own cover, one of its albums' covers, or an upload (`POST /api/admin/branches/:id/identity-image`; PNG, JPEG, WebP, GIF or SVG; shown only through an image tag and served sandboxed). All optional; "Automatic" gives a colour derived from the name.
Stored in `Branch.identityColor`, `identityGlyph` and `identityImageUrl` (**migrations**: `branch_identity`, `branch_identity_image`), validated on the server (`lib/branchIdentity.ts`: a picture address must be on this site's uploads or plain https). Shown on Soundbay, as the branch's tile on the homepage grid, and in the map card.

## Conversations (`/conversations`)
Three views, in the address: **Instrument** (default), **List** (`?view=list`) and **Map** (`?view=map`). The header holds only the title and a compact **mission status** strip beside it (a Busy / Steady / Quiet / Silent lamp comparing the last 24 hours with the previous 13 days' daily average, and small readouts; smaller on phones).
- **Instrument:** the channel board (trace, this week, then "last signal" with the signal bars) and a live feed (refreshes about every 30 s while visible; can be paused).
- **List:** the **scope** first (messages per day for 14 days for the channels you choose: the eight busiest this week to begin with; add, remove, reset; remembered in the browser; up to twelve; an all-channels line you can switch off), then the cards: kind, description (not the last message) and "X ago · N signatures · N signals".
- **Map:** the forum map embedded in a window (`ForumMapPage embedded`), fetched only when chosen; its "View as list" button switches this page to List.
**Dock first:** on desktop, clicking a chat (a card, a board row, a feed message) opens it in the chat dock; clicking the same chat again opens its page.
Data: `GET /api/conversations` returns `day`, a 14-day `trace` per chat and for the system, and `recent` messages with their chat's slugs, all from public chats only. The page fills in safe defaults for anything an older server reply lacks.

## Contribute (`/contribute`, `/submit`)
Guided: six clickable steps (Choose, Brief, Sketches, Submit, Review, If approved), a branch chooser (search, filters, sort) and a panel with the concept (the brief), a sample, the sketches and the member's own submissions to that branch (`mySubmissions` from `GET /api/contribute/branches`, only ever the viewer's own). Review is a person's decision: no wording says or implies automatic publishing (a test enforces it). A started submission with no tracks is continued at `/submit?branch=...&album=...` (only your own, only while pending); the album page itself has no upload controls.

## Keyboard
The global player shortcuts (Space, arrows) now step aside when focus is on a control that uses those keys itself (buttons, checkboxes, dropdowns, radio groups, sliders), so Space presses a focused button.

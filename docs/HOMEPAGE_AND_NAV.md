# Homepage and navigation

## Header
`⩽ EXOMUSICA ⪖` is centered. Left of it: **Soundbay** (music) and **XenoLab** (research). Right of it: **Telemetry** (community) and **Log** (wiki and news).
Tools (bell, messages, account, donate) are at the far right; the presence orbs at the far left. The current section is highlighted (`lib/navSections.ts`).

| Section | Address | What it is |
|---|---|---|
| Soundbay | `/soundbay` | Branches (most recently active first), growing seeds, playlists, community albums; shuffle; the way to the map and the player (`/listen`) |
| XenoLab | `/xenolab` | The Research page: start a study, recent studies, tools (Voice lab) and the Log |
| Telemetry | `/telemetry` | The community hub: **Conversations** (`/conversations`), **Members** (`/members`), the conversation map, challenges, sample bank, contribute, cult activities, messages; recent chat |
| Log | `/wiki` | The wiki, with **Pages** and **News** as tabs (`components/LogTabs.tsx`). News posts keep `/news/...` |

Old addresses redirect: `/research` to `/xenolab`, `/log` and `/about` to `/wiki`.

**Shortcuts** (desktop, not while typing): `S` Soundbay, `X` XenoLab, `R` Telemetry, `L` Log, `C` home. The older letters still work: `K` wiki, `N` news, `M` forum map, `U` cult activities.
`T` is not used for Telemetry because the Community, News and Wiki pages already use it. Below 1320 px the Admin link becomes a gear. Phones get two rows (brand, then the four links).

## Homepage (`/`)
Order: hero, **Explore the branches**, **Happening now**, three ways in, then the join band (visitors) or **Your work** (members).
The whole page is one request, `GET /api/home` (public data only, cached 30 s server-side, shared client-side with Soundbay and Telemetry for 20 s).
Members' own studies are one extra request after the page has appeared.

**Explore** (`components/HomeExplore.tsx`): a small SVG map of the branches that drifts gently. It introduces one branch every 7 s until the person touches it
(never with "reduce motion", never in a hidden tab), with a card: description, albums, last activity, Play shuffle, Open branch. Shuffle visits every branch once
before repeating and never shows the same one twice in a row (`lib/exploreLayout.ts`). **Full screen** opens the real interactive map (`SpaceMap`) over the window and
loads its data only then. `/?map=full` opens it directly. Beyond 40 branches the drifting stops.

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


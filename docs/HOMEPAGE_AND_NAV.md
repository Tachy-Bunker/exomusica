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
Sticky toolbar on desktop (it scrolls away on phones): search, the "Has albums" (default) and "All" chips, sort, and a jump bar with live counts per section. Filter chips everywhere on the site are dim until chosen. All of it, and which branches are expanded, is in the address.
A branch is a compact row: emblem (or its main image), name, short description, "N albums · N tracks" and a dimmed "active X ago", and its actions, left to right: **play** (a shuffle of that branch), **Discussion** (the chat dock on desktop, the branch page on a phone) and **Map**. The same buttons show on phones. **The whole row is the toggle**: a real button sits under the text, so a click anywhere that isn't a button opens the branch, and Space or Enter does it from the keyboard. Hovering lights the row's edge. A branch that is **playing** is marked "Playing now" and pinned to the top of its list while it plays; if it is open, the page scrolls up to it when it starts playing (not when merely resumed, and not for a branch that is closed).
**The expanded branch holds only what the row doesn't say**: its **longer description** (a second description written in the admin under Branches; empty means none is shown, so the short one is never repeated), its albums (cover with the little Album icon, title, track count, play button; fetched only when first opened) and up to three pictures on the right. `?open=a,b,c` expands several and scrolls to the first (even one the filter would hide).
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

## Shareable links and embeds
Everything a link can say lives in the address, in one format read by the normal pages and the embeds alike (`lib/shareState.ts`).

| Part | Written as | Meaning |
|---|---|---|
| Song | `track=12` (official) or `track=c12` (community) | the two sets number their tracks separately, so community songs carry a `c` |
| Time | `t=1:23` | also read: `83`, `83s`, `1m23s`, `1h2m3s`, `1:02:03`; whole seconds, at most a day; a time past the end of a song is held just inside it |
| Start playing | `play=1` | without it a song and time are only information: nothing starts |
| View | `view=venn` | the playlist map's constellation (the spacemap is the default); the older `#venn` still works |
| Genres | `solo=Ambient&solo=Drone&off=Noise` | soloed and switched-off genres (repeated parameters, so names with commas or `&` are safe); a genre both soloed and off is soloed; names the playlist doesn't have are ignored |
| Controls | `hideControls=1` | the embed shows only the picture and the player |
| Open branches | `open=a,b,c` | Soundbay, several at once (plain names only, at most 20) |
| Album | `album=slug&play=1` | Soundbay starts that album (add `track` and `t` for a song in it) |

**Where it applies:** the playlist map (`/playlist/:slug`, and `/embed/playlist/:slug`), the playlist list view (`/playlist/:slug/list`), branch albums (`/album/:slug`), community albums (`/community-album/:slug`) and Soundbay. Every one of those pages (except Soundbay, which has a copy-link button) has a **Share** button opening `components/ShareModal.tsx`: choose a song, a time, whether to start playing; on the map also the view and whether to keep the genre switches; the dialog gives the link and, for the playlist maps, the embed code (size, hide-controls). A genre soloed *by a link* does not start the music (soloing by hand still does); a linked song with soloed genres plays that song and queues the rest of those genres after it.

**Starting to play** (`components/ShareAutoplay.tsx`): browsers allow sound only after the visitor has acted. If they already have (they followed an in-site link) the song starts at once, from the right moment (`playAt` in the audio store seeks when the file's length is known). A visitor arriving from outside gets a one-tap **Play** prompt naming the song and moment; the same prompt appears if the browser refuses after all. Seeking into a song needs the server to answer byte-range requests (`@fastify/static` does by default; the external-media proxy passes them through).

**Soundbay:** which branches are expanded is kept in the address (`open=`), so any view can be copied; `?open=` also shows a branch the "Has albums" default would hide, and scrolls to the first one.

## Live refresh
Conversations refreshes its data every 15 seconds, but only while the module is showing live data (not in the Map view), the tab is visible, the browser is online and the visitor has moved, typed or scrolled in the last 10 minutes (`lib/livePoll.ts`). Coming back (tab visible again, activity after being away, switching to a live view) refreshes at once if the data is stale. The refresh button refreshes now and restarts the 15 seconds. The server computes nothing in the background: `/api/conversations` is built on request and one copy is shared for 15 seconds.

## Usernames
Outside chat a member's name is a `Username` (`components/Username.tsx`): in the colour chosen in the admin under Fonts & Misc, linking to their page, dimmed along with dimmed text. The colour is `SiteSettings.usernameColor`, applied as `--username-color`.

## Branch images (admin)
`/admin/branches/:id/identity`: a **main image** (shown instead of the emblem; the branch's colour becomes its average) and a **secondary image** (the soft background of its tile and, at 17%, of the homepage Explore module while it is chosen), chosen from the branch's own pictures (`GET /api/branches/:slug/images`: its cover, its albums' covers and gallery images) or uploaded (main only). Columns: `Branch.identityImageUrl`, `identitySecondaryImageUrl`. Adding a track to an album can also search what is already on the server or upload a file (`/api/admin/track-search`, `/api/admin/track-upload`).

## Discord bridge
Posting a website message to Discord (`lib/discordBot.ts`): the member's Discord picture is found through `lib/discordLookup.ts` (own id, captured id, a linked import account's id, then Discord username; a targeted member search, cached 30 minutes, retried once, an older picture used if Discord fails). `@name` becomes `<@id>` for mentioned members whose Discord account can be found (`lib/mentions.ts`), and the post may ping only those members (`lib/discordPayload.ts`: never @everyone, @here or a role).

## XenoLab (`/xenolab`, sections as tabs: `?tab=`)
Six tabs, in this order: **Studies** (default), **Resources**, **Analyze**, **Effects**, **Open calls**, **Contribute** (ids in `lib/xenolab.ts`; the Log tab is hidden for now, `components/xenolab/LogPanel.tsx` is kept unused). Old addresses keep working: `?tab=overview|log` open Studies, `samples` → Resources, `voice` → Effects, `challenges` → Open calls; `/studies`, `/sample-bank`, `/challenges`, `/contribute` redirect into the matching tab. "Open calls" is one label in `LAB_TABS` if a different name is wanted.
- **Studies** (`components/xenolab/StudiesPanel.tsx`): templates, filter (All / Mine / In progress / Complete), search, preview cards. `GET /api/studies` returns an `excerpt` (`backend/src/lib/studyExcerpt.ts`) and the branches a study is connected to.
- **Resources** (`SamplesPanel`): audio/files anyone might build with; each has an optional cover and a gallery of up to 3 images (`SampleBankItem.imageUrls`, `imageAttachmentIds`; multipart upload in `routes/sampleBankAndChallenges.ts`, files removed with the item). Audio plays on its card and has *Analyze*.
- **Analyze** (`components/SoundAnalyzer.tsx`): measured entirely in the browser, nothing uploaded (details unchanged: `lib/decodeForAnalysis.ts`, `lib/soundReport.ts`, `workers/soundReport.worker.ts`; LUFS, peaks, spectrum, tempo, pitch, key). The Plot tool lives under it.
- **Effects** is the voice lab embedded. **Open calls** is `ChallengesPanel`. **Contribute** is `ContributePage` with `embedded`.

## Studies ↔ branches
A study can be connected to none, one or several branches (implicit many-to-many `Study.branches` / `Branch.studies`; set on the study page, `PATCH /api/studies/:slug { branchSlugs }`; hidden branches are never shown to others). Connected studies appear under the gallery of a branch in the homepage Explore module and under the albums of an expanded branch in Soundbay (`components/BranchStudies.tsx`, data from `/api/home`).

## Telemetry (`/telemetry`, formerly Conversations)
`/telemetry` is the Conversations page (`pages/ConversationsPage.tsx`; `/conversations` redirects). Views, in order: **List** (default: topics under their categories in the admin's category order, then branches, growing seeds, studies, questions; always in the order they come, search only, `groupForList` in `lib/spaceHubs.ts`), **Instrument**, **Map**. The old tile page is gone. Homepage "Happening now" has Conversations, Members and Cult activities boxes, with everything else in **Other**.

## Member page (`/u/:username`)
"← Members" link and the **R** shortcut (desktop) go back to the directory. Stats come from `GET /api/users/:username/stats`: Signals (all messages in chats the public may read), a 14-day bar trace, and the studies the member owns.

## Play highlight
`SiteSettings.playHighlightColor` (admin, Fonts & Misc; empty = off) lights the Play buttons to reach for: the homepage Play when a branch is chosen, Soundbay's Shuffle all while nothing plays, a branch's play button while hovered, an album's main play button and a hovered track, and the same for playlist list view. `components/PlayGlow.tsx` draws a glow and a few fireflies that drift on 1-D Perlin noise (`lib/noise.ts`, `lib/fireflies.ts`). One shared 30 fps loop runs only while a glow is mounted, the tab is visible and reduced-motion is off.

## Loudness
Tracks are normalised to **−11 LUFS** (`lib/replayGain.ts`). A quieter track is raised only as far as its sample peak allows (peak − 0.3 dB), so nothing clips; louder tracks are lowered to −11. The stored column is `replay_gain_db_v2`, so every track is measured again the first time it is played after upgrading. Chromatic aberration is off by default for everyone (`userCaEnabled`); members can turn it on in their settings.

## Admin: topic backup
`/admin/channels` (discussion topics): export one, the selected, or all as JSON (`GET /api/admin/topics/export?ids=1,2|all=1`), import a file with a preview and per-topic checkboxes (`POST /api/admin/topics/import`), and delete a topic (`DELETE /api/admin/channels/:id`; also removes its messages and their files). The file holds text, authors (by username), reply links and the page content; **not** uploaded files or reactions. Import never overwrites: missing topics are created, existing ones only receive messages they lack (same author, time and text); an author whose account no longer exists becomes a ghost with that name. Branch chats cannot be deleted here.

## Tests added (fix277)
`frontend/_scratch/e2e_fix277.py` (Playwright with a mocked API: 49 checks incl. phone-width overflow), `groupForList.test.ts`, `replayGain.test.ts`, `noise.test.ts`, `backend/_scratch/topicBackup.test.ts`. Earlier: `soundReport.test.ts`, `telemetryPins.test.ts`, `studyExcerpt.test.ts`. Run with `npx tsx`; the e2e needs `npx vite preview --port 4173`.

## fix278 notes
- Studies tab order: studies, filter/search bar, then the start-a-study form (or the log-in notice). Effects no longer has its own voice-note recorder block.
- Contribute is three steps (a strip), one row per branch (name, three dots for brief/sample/sketches, your submission state), and per branch three tiles (Brief: read inline or download; Sample; Sketches) plus one next action. Search appears only with 8+ branches. `ContributeTimeline` was removed.
- Telemetry List view on a phone: the list first, the Scope after it.
- Fireflies: four per glowing button; with reduced motion they still show but drift at a quarter speed and the button does not pulse.
- `.hb-item` must stay `position: relative`: the whole-card link uses `::after { inset: 0 }` and otherwise covers the nearest positioned ancestor (it made a homepage activity link cover the page).

## fix279
- Play highlight: default on (icy blue `#8fd8ff`); `playHighlightColor = "off"` disables it. Fireflies also show under reduced motion (slow).
- Pause icon on the Explore module, Soundbay, album, community album, branch and playlist buttons when that item is the one playing; click toggles.
- Media Session (`lib/mediaSession.ts`): title/artist/album/artwork + play/pause/prev/next/seek handlers.
- Explore perf on mobile: memo tiles, `startTransition`, async image decoding, simplified hover-less CSS.
- XenoLab: Contribute right after Studies. Study cards use a background image (`Study.backgroundUrl`; link, upload `POST /api/studies/:slug/background`, or a connected branch's image); no excerpt.
- Contribute: rows/panels use the branch's primary/secondary image; the sample is any site track (Branch.sampleTrackId / sampleCommunityTrackId, set in Admin → Branch → Contribution) or a chat attachment, played via the site player with a provenance link.
- Sort labels: Telemetry Recent/Busiest/A to Z; Soundbay Recent/A to Z/Tracks.
- Mobile: page titles hidden, Account button top-left (guest: "Log in" bubble).

## fix280

- **Background strength**: `--bgo` sliders for Study backgrounds (`Study.backgroundOpacity`) and branch pictures (`Branch.identityBgOpacity`). Default 0.17, range 0.05–0.9.
- **Map hidden**: `lib/features.ts` → `MAP_VIEW_ENABLED = false` hides Soundbay "Explore the map", Explore "Full screen" and `/?map=full`. Flip to `true` to bring it back.
- **Featured articles**: `FeaturedArticle` model, `routes/featured.ts` (public list cached 30 s), `components/FeaturedArticles.tsx` (single exponential camera, one rAF loop only while moving, idle advance every 6.5 s, paused 12 s after a touch / hover / off-screen / hidden tab / reduced motion). Admin: `/admin/featured`.
- **Resources**: paid flag + PayPal link + coupons (`ResourceCoupon`, `ResourceUnlock`). File URL withheld while locked; redeem is rate-limited (8 per 10 min). Admin: `/admin/resources`. Protection is by URL secrecy.
- **SEO**: studies, resources, open calls have og fields and `/embed/study/:slug`, `/embed/resource/:id`, `/embed/open-call/:id`. Deep links `/resource/:id`, `/open-call/:id`.
- **News/Wiki** use the Study editor (`ArticleEditor`) and `SeoFieldsEditor`. Same markdown, no data migration. Edit links: `/admin/blog?edit=slug`, `/admin/wiki?edit=slug`.
- **Log**: Studies folder in the tree, "Recent studies" on the Log home.

## fix281: the shell

- **Faceplate** (`components/Faceplate.tsx`, mounted by `AtlasShell` in `Layout`): sticky bar under the header. Shows the page's "frequency" (every thing has one, stable, derived from its name, each kind in its own amateur band: see `freqOf` in `lib/atlas.ts`), its name, what it belongs to ("in ‹branch›"), and the Around / Pocket / Terminal buttons. `--nav-height` now includes it.
- **Margins** (`components/AtlasShell.tsx`, CSS in `global.css`): on screens 1340px+ the related things sit at the edges (left = where you came from, right = nearby, bottom = the conversation, up = the faceplate's "in" chips). Below that, the Around button opens the same lists as a panel. Data: `GET /api/atlas/around?key=study:slug` (branch, study, album, wiki, news, topic, resource, call). Clicking one slides the next page in from that edge.
- **Desire paths**: `POST /api/atlas/trace` receives anonymous (from,to) pairs; `EdgeCount` stores counts only; a route appears in the margins only after 3+ people took it. Browsers sending Do-Not-Track / GPC send nothing.
- **Pocket** (`lib/pocketStore.ts`): things you picked up, kept in localStorage (max 24). Items are draggable links: dropping one in a chat input pastes its address.
- **Master Terminal** (`components/Terminal.tsx`, Ctrl/Cmd+K, or ` or : outside fields): type a name to go there, or a command. All commands live in `lib/actions.ts` (the registry); add an `Action` there and it exists in the terminal. `GET /api/atlas/index` feeds name matching (cached 60 s).
- **Operator** (`lib/operator.ts`): the one voice for the site's small notices.
- Not done yet (planned next): real View Transitions (the app uses `BrowserRouter`, which has no `viewTransition`; needs a data-router migration), GUI-action → command hints, terminal on/off setting, `play` command.

## fix282: contributor-point rewards, resource previews, points page

**Rewards sit on the existing ledger** (`ContributorPointsEntry`); no new currency.
- `Reward` (title, cost, optional `itemId` of a paid resource, `perUser`, `stock`, `active`) and `RewardClaim` (status pending → fulfilled | refunded).
- A reward linked to a paid resource unlocks it at once (`ResourceUnlock.via = "points"`). Others go to the admin queue (`/admin/rewards`).
- Claim runs in one transaction under `pg_advisory_xact_lock(userId)` (no double spend); stock is decremented with `updateMany ... stock > 0`.
- Refund adds a +cost ledger entry, restores stock and removes the points-based unlock.
- Rewards are opt-in: an admin creates one per resource (redeeming points costs the artist a donation). A reward with claims cannot be deleted, only switched off.
- Admin can also gift a resource to a member (`POST /api/admin/resources/:id/grant`, `via = "gift"`). All admin writes are audit-logged.

**Previews** are supplied by the author (audio ≤ 20 MB, or an https link) and play with the same `SamplePlay` button as the Contribute page. No auto-generation.
- `SampleBankItem.previewUrl` / `previewAttachmentId`; `POST/DELETE /api/sample-bank/:id/preview` (owner or admin).
- A resource can only be marked paid with a preview or at least one picture (`previewProblem`).
- Previews are public by design.

**Members** now see their balance, history and claims at `/rewards`. Terminal: `go rewards`, `admin rewards`.

**Known limits:** paid files are still protected by URL secrecy only (signed short-lived links are planned). Earning is manual (admin awards, accepted submissions) until the hypothesis basket. No generic entitlements table yet; it comes with the ARG keys.

Tests: `backend/_scratch/rewards.test.ts`, `frontend/_scratch/e2e_fix282.py` (21 checks).

## fix283: hypothesis basket

Pages: `/hypotheses` (list, status filter, "Draw one", propose), `/hypothesis/:id`, `/hypotheses/draw` (straight to a random open one). Terminal: `go basket`, `go draw`.

**A hypothesis** = title, claim (one falsifiable sentence), protocol, requirements, status (`open`, `testing`, `supported`, `contested`, `refuted`, `inconclusive`) with an author note, and an optional link to one of the author's studies.

**Two ways to answer, one tap each**
- *A/B test*: the author gives two clips (audio ≤ 10 MB or https links) and a question; the claim predicts **A**. Each participant gets the clips in random order (client-side coin flip, sent as `swapped`); the server maps "Clip 1/2" back to claim/other (`normalisePick`).
- *Try-it*: no clips; participants try the protocol and tap "It holds / It doesn't / Not sure".
- Clips cannot be edited after creation (the answers are about those clips).

**Participant mode**: no account needed. A random token is kept in localStorage and only its SHA-256 is stored (`Trial.who = "p:<hash>"`, members `"u:<id>"`). One answer per participant per hypothesis (unique index). Authors can't answer their own. Settled hypotheses take no answers. 60 answers/min/IP.

**Blind results**: for A/B tests the split is hidden until you have answered (author/admin always see it).

**Statistics**: exact two-sided binomial test against 50% over the informative answers (claim + other; "can't tell" is counted but not tested). `suggestStatus` only *suggests* (≥10 informative: p < .05 → supported/refuted; ≥30 and p > .3 → inconclusive). The author decides; "contested" is always manual.

**Points**: members +1 per answer (max 5 per UTC day, ledger reason "Trial: …"); author +5 once when they settle a hypothesis with ≥20 informative answers.

**Known limits**: anonymous tokens can be reset by clearing storage (so a determined person can answer twice; this is a crowd poll, not a trial); the swap flag is client-supplied; hypotheses are not Atlas entities yet (no frequency/margins); the pipeline study draft → wiki claim is only the study link for now.

Tests: `backend/_scratch/hypotheses.test.ts`, `frontend/_scratch/e2e_fix283.py` (18 checks).

## fix284: letters, landmarks, the Trace lens

**A letter** is a small drawing on a fixed 1000×700 sheet: ink strokes, text (placed, turned, sized, curved along an arc) and stamps (CQ, 73, QSL, TX, star, wave, eye, key), on paper / night / ink / grid. Stored as JSON; the server (`lib/letters.ts`, `cleanDoc`) rebuilds every field from a whitelist and clamps it (≤150 marks, ≤6000 ink points, ≤120 chars of text, palette colours only, ≤120 KB). Rendering is SVG made only from those fields, so a letter cannot carry markup or script.

**Two destinations**
- *To a member* (`/letters`, tab Write): optional **slow post** (held 6 h / 1 day / 3 days; the recipient can't see it earlier, the sender sees "in the post"). 10 per day. Recipients can delete a letter or **stop letters from a sender** (deletes theirs, and later sends silently go nowhere, so blocking can't be probed).
- *On a place* (a **landmark**, a.k.a. dead drop): `mark` in the terminal, or "Leave one" in the lens panel. Needs a real entity (checked), fades after 30 days, max 20 per place, 5 per author per day, can be left unsigned (admins still see the author). Authors and admins can remove them.

**The Trace lens** (faceplate button, terminal `lens [on|off]`; remembered per browser, off by default). With it off the page makes no request and shows nothing; with it on, `GET /api/landmarks?key=` loads the marks for the place you're at into a small panel. The faceplate also shows a **Letters** link with an unread count (polled every 2 min and after opening a letter).

**Composer performance**: ink is written straight to one live `<path>` while the pointer moves (no React render per point), points closer than 4 units are skipped, and on release the stroke is thinned to ≤600 points and committed; each item is memoised so dragging one text doesn't redraw the ink.

**Not yet**: images in letters, trails (routes between marks), notifications for new letters beyond the badge, a report button (admins can delete via the letter id for now).

Tests: `backend/_scratch/letters.test.ts`, `frontend/_scratch/e2e_fix284.py` (21 checks).

## fix285: chat message types, slash commands, squelch

**Structured messages**: `Message.kind` (`text` default, `cq`, `report`, `poll`, `ab`, `clip`) + `Message.data` (JSON). The server (`lib/chatKinds.ts`, `cleanKind`) rebuilds `data` from known fields and **writes `contentRaw` itself** as a readable fallback (`[CQ] …`, `[Report] … R5 S7 T6`, `[Poll] …`, `[A/B] …`, `[Clip] 0:12-0:20 <url>`), so Discord forwarding, search, the archive, exports, notifications and old clients keep working unchanged. Structured messages can't be edited (delete and resend).

**Slash commands** (typing `/` lists them; bad usage is explained inline and nothing is sent; unknown `/words` are ordinary text):
- `/cq <topic> [+listeners +feedback +collab +sample +answers]`: a call; the card has an Answer button (reply).
- `/report <link or name> <R/S/T>`: signal report, Readability 1-5, Strength 1-9, Tone 1-9 (`5/7/6` or `576`) + optional note.
- `/poll <question> | <option> | <option> …` (2-6).
- `/ab <question> | <audio link A> | <audio link B>`: blind A/B; same vote mechanics as a poll.
- `/clip <audio link> <from>-<to> [label]` (`0:12-0:20` or seconds; ≤ 2 min): plays only that span via a media fragment on a plain `<audio>` (no JS player, no extra load). A site track link plays from its own file.
- Audio links must be `https://…` or `/uploads/…`.

**Polls**: one changeable vote per member (`PollVote`). Counts are **hidden until you have voted** (author/admin always see them) so the numbers can't steer the vote; `GET /api/messages/:id/poll` is viewer-specific, the `poll.vote` socket event just tells open cards to refetch.

**Squelch** (client-side, remembered): `open` / `quiet` (hides one-liners under 12 characters) / `signal` (keeps links, sound, calls, replies and mentions of you) / `calls` (only structured messages). Your own messages and anything addressed to you are never held back; the number held back is always shown. Nothing is deleted.

**Already existed**: voice notes (the 🎙 recorder in the composer) cover most of push-to-talk.

**Not yet**: structured cards in the mini-chat dock and PMs (they show the fallback text), squelch there, contextual chat per item, `/scope` and `/analyze`.

Tests: `backend/_scratch/chatKinds.test.ts`, `frontend/_scratch/chat.test.ts`, `frontend/_scratch/e2e_fix285.py` (21 checks).

## fix286: the numbers station (ARG engine core)

Pages: `/signal` (players, login required; terminal `go signal`), `/admin/signal` (puzzle-graph editor, terminal `admin signal`).

**Fantasy calendar** (`backend/src/lib/signal.ts`, mirrored in `frontend/src/lib/stationCalendar.ts`): 13 months of 28 days (Static, Drift, Carrier, Sideband, Squelch, Heterodyne, Overtone, Formant, Aliasing, Phase, Grain, Decay, Silence) + a Null Day = 365-day Cycle, counted from 1 Jan 2026 UTC. Dates only, never time of day. A transmission may be set to go on the air on a station date.

**Nodes** (`PuzzleNode`): title, text, optional media (https or /uploads; audio and images render natively, so lossless WAV/FLAC work), hint, optional answer, requirements (other nodes), optional collective lock (`quorum`), optional date, reward (text, link, 0-100 points, and/or a resource unlocked with `ResourceUnlock.via = "puzzle"`), published flag. No answer = the player just logs reception.

**Answers**: normalised (accents and punctuation dropped, case-insensitive), then `sha256(salt:answer)` with a per-node random salt, compared in constant time. The hash and salt never leave the server; the admin can only replace, remove or test an answer. 10 tries/min per member per node. Answers are never written to the audit log.

**What's on the air** (`isOnAir`): published, its date has come, and every requirement is met. A requirement **with a quorum** is met for *everyone* once that many different members have solved it (a collective lock); any other requirement is met by your own solve. Anything not on the air for you is not sent at all (no titles, no counts) and answering it returns "Nothing on that frequency".

**Rewards** are granted once, on the first solve, and shown only to those who solved it.

**Admin**: SVG graph layered left to right by requirement depth (drafts dashed, locks show progress), click a node to edit, requirements as checkboxes (loops are refused), station-date picker, answer test, delete (dependents stop requiring it). The admin layout now stacks on phones.

**Not yet** (the content tools that make puzzles): a "Signal studio" to generate Hellschreiber-style spectrogram text and XY-scope audio, SSTV, the UV lens, the foxhunt S-meter, spectrogram player bar; node reset/ban tools; a player-facing map; notifications when something new goes on the air.

Tests: `backend/_scratch/signal.test.ts`, `frontend/_scratch/signal.test.ts`, `frontend/_scratch/e2e_fix286.py` (22 checks).

## fix287: Signal studio (making the puzzle media)

Page `/admin/signal-studio` (button on `/admin/signal`; terminal `admin signal-studio`). Everything is generated **in the browser**, in a Web Worker (falls back to the page's thread), and nothing leaves the machine until you press Upload.

**Text in the spectrogram** (`lib/studioDsp.ts`): a 5×7 pixel font (A-Z, 0-9, `. , ! ? - : / + = '`, space; max 40 characters). Each lit pixel is a steady tone for its column's duration, top of a letter = highest pitch, time left to right, so the words read in any linear-frequency spectrogram. You set length (2-60 s), the pitch band, and boldness (tone spacing from 200 Hz down to 45 Hz; tighter = solid letters, more CPU). Tones are only computed while their pixel is lit; edges use a 2 ms smoothing so there are no clicks; peak-normalised to 0.9.

**Drawing for an XY scope**: draw strokes on a pad; left channel = x, right channel = y; the pen walks the strokes in order and back to the start 10-120 times a second (the moves between strokes are drawn too: a scope has no pen-up). Stereo output.

**Output**: lossless 16- or 24-bit WAV at 22.05 / 32 / 44.1 / 48 kHz, an in-page player, a **spectrogram preview in the site's accent gradient** (forum orange to audio blue, dark at the bottom) so you can check the result exactly as a solver would see it, a Download button, and **Upload for a transmission** → `POST /api/admin/signal/media` (admin only; WAV/FLAC/MP3/OGG audio or PNG/JPEG/WebP/GIF, ≤ 60 MB, extension must match type, stored under `uploads/signal/`) which returns the `/uploads/signal/…` path to paste into the node's media field.

**Not yet**: SSTV encoding, the UV lens, the foxhunt S-meter, the solver-side spectrogram player bar, an image-to-XY tracer (draw by hand for now).

Tests: `frontend/_scratch/studio.test.ts` (font shape; text lands in the right pitch/time cells of a real FFT; XY range and periodicity; WAV headers; FFT bin accuracy; gradient), `backend/_scratch/signal.test.ts` (media types), `frontend/_scratch/e2e_fix287.py` (9 checks, including reading the generated WAV and counting lit spectrogram pixels inside and outside the pitch band).

**Also fixed in fix287**: the Master Terminal took focus a frame late, so keys typed right after Ctrl+K could be lost (the input now takes focus the moment it opens). It showed up as an intermittent failure in the fix281 e2e (~50% of runs); 8/8 clean after the fix.

## fix288 — Spectrogram seek strip + track comments

- The player's seek bar becomes a spectrogram in the site accent gradient (dark → orange → blue), docked (22px) and expanded (56px). The picture is painted once on a canvas; the playhead and the "unplayed" dimming are CSS transforms, so playback costs nothing per frame.
- The server draws each track's strip once with **ffmpeg** (`showspectrumpic`, 1000×40, one thread, jobs queued one at a time), stretches the contrast by percentile, caches it under `uploads/spectro/<trackId>-<hash of fileUrl>.spec` (40 KB) and serves it with a one-year immutable cache. Replacing a track's file changes the hash, so it is redrawn. `GET /api/tracks/:id/spectrogram`: 501 if the server has no ffmpeg, 422 if the audio can't be drawn; the player then keeps its plain bar.
- ffmpeg is restricted to `file,http,https,tcp,tls,crypto` and local sources never leave `uploads/`.
- Comments live **on the strip**: click it to seek and choose the moment (`@m:ss`), type, Post. Pins sit on the strip; click one to jump and read it; comments within 4s of the playhead show as a live caption. Authors and admins can delete. 240 chars, one line, 8 posts/min/user, 400 per track. `TrackComment { trackId, userId, atSeconds, body, createdAt }`.
- Docked bar shows pins and the gradient but not the composer (the expanded view is where you write).
- Deployment: `backend/Dockerfile` now installs `ffmpeg` (alpine package, ~60 MB image growth). Needs `--build`.

## fix289 — Explore easing, terminal menu + ghost completion, Trace explainer, pocket → chat, dock-aware faceplate

- **Explore:** the area under the card (pictures, studies) is always mounted and eases open/closed with a CSS grid-rows transition (0fr↔1fr, 0.32s, opacity 0.22s). It keeps the previous branch's content while closing, and holds its state while a branch's pictures load, so there is no closed-then-open flicker. No JS animation; off under reduced motion.
- **Terminal:** with nothing typed it shows "Go to" chips (places) and "Type" chips (every command you may run; click fills it). Commands now complete like places (`len` → `lens`). On desktop (hover + fine pointer) a faint ghost completion shows the rest of the top match and a `Tab` key hint; Tab accepts it. Mobile keeps tap targets and shows neither.
- **Trace lens:** hover/focus on the button explains it; the button shows "on"; on pages that can't hold marks it now says so (instead of showing nothing); where marks can be left the panel says what marks are and has "Turn lens off".
- **Pocket → chat:** dropping a link on the composer was swallowed (the drop handler only knew files). Drops now insert a markdown link at the cursor. Plates carry `[title](absolute url)` when dragged. The pocket tray has a ↵ button per item that pastes into the chat composer on screen (`lib/chatInsert.ts`, event `exomusica:chat-insert`).
- **Dock open (desktop):** the edge margins give way; "You were here" and "Nearby" sit in the middle of the faceplate and drop down on hover over everything (z 70), including the chat panel. The faceplate now stops at the dock's edge so its buttons are never covered.

## fix290 — Chat redesign, phase 1: the composer knows the site

Chat redesign roadmap (agreed; not built: squelch knob, RST reactions): 1 dial of rooms · 2 conversation spectrogram · 4 composer as terminal + pocket row + links to things · 5 tether · 6 peek-rail dock + presets · 7 sidebands · 8 voice strips · 9 mobile handset · 11 catch-up reel · 12 send receipts.

Phase 1 (this delivery), idea 4:
- `#name` (up to two words) or `~7.156` before the cursor opens a picker of Atlas things (by name / nearest frequency). Up/Down move, Tab or Enter picks (Enter does not send while it is open), Esc closes. `## headings` and `#12` are left alone. The Atlas index loads only when a trigger first appears.
- A pick inserts a plain markdown link `[Title](https://site/path)`, so Discord relay, search and archive keep working unchanged.
- Any in-site link to a thing renders as a chip everywhere messages render (chat, mini-chat, PMs): glyph, name, frequency. Other links stay links.
- The pocket is a row of chips above the composer: tap to insert, drag to drop anywhere in the composer.
- Slash-command hints are buttons that fill the command.

## fix291 — Chat redesign, phase 2: the conversation as a spectrogram, and the catch-up reel

- **Strip** (`ChatStrip`, `lib/chatStrip.ts`): a 12px strip beside the message list when the list scrolls itself (dock, phone, topic pages) with 8+ messages. Each message is painted where it sits in the list; brightness along the site gradient = loudness (length, reactions, structured cards, files, links to things); the left lane is orange for your messages. The lit window shows what is on screen; click or drag to travel. A white line marks the first unread. Measured and painted once per change (a rAF, one `getBoundingClientRect` pass, one 10×240 canvas), scrolling only moves one CSS box.
- **Catch-up reel** (`CatchUp`): reopening a channel with 10+ new messages from others shows how many, who spoke, and three highlights (most reacted, structured, substantial; deterministic, no AI), plus First unread / Skip to live / dismiss.
- **Where you left off** is stored per channel **on this device** (`exomusica_seen_<slug>`), advanced when you reach the bottom or leave. No schema change; it will not follow you across devices (a server read-state table is the follow-up if wanted). First visit shows no reel. Capped by the 100 loaded messages ("100+").

## fix292 — Seven fixes

- **Squelch** is off screen by default; a ⌁ button in the chat toolbar opens it. It stays visible while a level other than "open" is set, and hides itself when set back to open.
- **Faceplate with the dock open** keeps its full width (the fix289 padding was wasted space). The dock starts below it.
- **"You were here" / "Nearby"** now live in the middle of the faceplate on every wide screen (hover to drop down), not on the page edges, so they can no longer sit over the Log's columns, admin columns or the collapsed chat latch. The edge margins are removed.
- **Around / Pocket on a phone** are bottom sheets over a dimmed backdrop (tap it to close) with a visible "Close ×" in a sticky header. On wide screens the same header gives the dropdown a visible close.
- **Telemetry on a phone:** List / Instrument / Map sit in the header row between the members button and the stats; the controls row loses a line. Wide screens unchanged.
- **QR dialog** renders in `document.body` (z 200). Inside `main` it sat in the page's transformed stacking context, below the sticky bars.
- **Study → Log:** a "← <Log page you came from>" chip, other Log pages that link to the study (found by the study's address in their text; `atlas/around` now returns them as context, so they also show in the faceplate "in" chips and the Around sheet), and "The Log". No schema change.

## fix293: Signal, Trace lens, Post

**Signal ("transmissions").** `lib/signalUi.ts` + `SignalPage`: a short "How this works" (open on first visit), tabs To solve / Solved / All (opens on whichever has something), TX-007 labels, a "new" badge for ids not seen on the last visit (`exomusica_signal_seen`), "Already tried" chips per node (`exomusica_signal_tried`, device-local, tap to refill), audio gets "Analyze" (hands the file to the Xenolab analyzer), images get a zoom lightbox, and all media can be downloaded. Answers stay server-checked; nothing about them is stored in the page.

**Trace lens = long-range scan.** `Landmarks.tsx`: header "LONG-RANGE SCAN", the sector's frequency (the same `freqOf` as the faceplate), a round scope with one blip per beacon (stable position from the id, `blipAt`), a sweep that is a single CSS transform (static under reduced motion), "signal decays in N d". The lens button icon is a scope whose needle turns while on. Test ids unchanged.

**Post** replaces Messages and Letters. `/pms` and `/pms/:username` are the one page; `/letters` redirects there, keeping `?to=` (opens that person in letter mode) and `?at=` (drop a beacon on a place). The list merges PM partners and letter partners (`lib/post.ts`); a thread is one timeline of texts and letter stamps (a letter opens in place; slow-post letters show as "in the post"). The composer switches Message | Letter. Faceplate "Letters" is now "Post" with one badge (unread letters + unread conversations; `profileStore.unreadPms`).

**Message markdown** (`lib/messageBlocks.ts`, used everywhere `renderMessageContent` is): fenced code with language, `-`/`*` and `1.` lists, `---`, `#`/`##`/`###`, `![alt](url)` for pictures **on this site only** (remote ones stay links, so nobody can track readers), a bare audio URL becomes an inline player. Discord habits (`-#`, `||spoiler||`, `>` ...) still work. The Post box (`MdBox`) adds a toolbar (`lib/mdEdit.ts`, Ctrl+B/I/K), live preview, `#name`/`~7.156` linking and the pocket's send button.

## fix294: the dial of rooms (desktop dock)

`lib/rooms.ts` is the shared logic (pure, tested): six fixed preset slots, a recents list (8), `dialOrder` (pinned by slot, then unpinned recents) and `tune` (wraps). `chatDockStore` persists `presets` and `recents` (localStorage `exomusica_chat_dock`, so device-local, no schema change) and gains `pinRoom`, `unpinRoom`, `tuneRoom`, `openSlot`; `openChat` records recents. `DialRail` sits under the dock title: ‹ frequency › (the room's own `freqOf`), six slots (click to tune, × to unpin, empty slot pins the current room), and up to three recent rooms. Keys, also with the dock closed or while typing: **Alt+1..6** tune, **Alt+Shift+1..6** pin the current room there, **Alt+[ / Alt+]** step. The phone sheet will reuse `rooms.ts`; the rail does not exist under desktop width.

## fix295: the dial grows up

**Schema:** `User.dialJson Json?` (migration `fix295_dial`). `GET/PUT /api/account/dial` store the member's pinned rooms, scenes and sleeping slots (cleaned by `backend/src/lib/dial.ts` on the way in and out, max 16 KB); the dock takes the account's copy on login, or pushes the device's if the account has none, then pushes changes 1.2 s after the last one (`useDialSync`). `GET /api/dial/pulse?slugs=&seen=` answers for up to 12 rooms: last message (author + text, 90 chars), messages in the last 30 min, and mentions of you since the last message you saw there (the per-room `exomusica_seen_<slug>` from fix291).

**Lamps and pings.** `useDialPulse` asks once a minute while the tab is visible (and when the room list opens). Each slot has a lamp (0..3 by `heat`) and a dot when someone mentioned you there.

**Room list (Q).** `RoomSwitcher`: every dial room with number, frequency, lamp, ping and the last line said. **Q** (not while typing), **Alt+Q** (also while typing) or the rail's *Rooms* button opens it; arrows or 1-6 pick, Enter tunes, Esc closes. Scenes (named sets of six slots, max 5) are at the bottom.

**Other.** Sleep (`z` on a slot): stays pinned, tuning steps over it. Drop a topic or branch Plate on a slot to pin it, or on the frequency to tune to it (`lib/roomDrop.ts`). Whisper: **Alt+Shift+Enter** sends the unsent draft to the next room on the dial; the ↑ on a row of the list sends it to that room (`exomusica:whisper`, handled by the visible `ChannelPage`). Master Terminal: `room 2 | room lab | room next | rooms`, `pin [n]`, `unpin n`, `sleep n`, `scene`, `scene save <name>`, `scene <name>`, `scene rm <name>`. (`tune` stays the frequency command.)

## fix296 - Scan Visor, pocket drops, point-cloud spectrogram, tag-aware imports

- **Header:** the envelope is gone from the main bar and the phone hook; Post lives only in the faceplate. Telemetry List lost the circle mask (the old `.scope*` CSS was colliding; the visor uses `visor-*` classes only).
- **Phone:** Telemetry Instrument sort sits on the chips' row; Soundbay has no dead gap above Search and its copy-link / shuffle-all buttons sit in the "Branches" heading row; Contribute scrolls to the opened branch's name row.
- **Scan Visor** (was Trace Lens; verbs `scan`, `visor`, `lens`, `trace`): no dialog. A small HUD, a corner-bracket grid over the page, beacons placed where they were written. "Write on the page" then click anywhere; the note posts with `x` (fraction of page width) and `y` (px from top) (`Letter.posX/posY`). Old sheet drawings with no spot are scattered by id, clear of the HUD.
- **Pocket drop:** branch rows in Soundbay and any link to a site thing are draggable; a pocket pad appears while dragging, the faceplate Pocket button is a target too. Private pages are not things, so nothing is carried. Touch screens cannot HTML5-drag.
- **Spectrogram:** 250x20 4-bit points (2500 bytes, `uploads/spectro/<id>-<hash>.pts`) painted on a canvas through a ramp of the cover's average colour. Old `.spec` files are unused and can be deleted.
- **Imports:** uploads read embedded tags (title, artist, album, track no., year, genre). Admin `track-upload` returns them; community upload has an optional title (typed > tag > file name) and composer falls back to the artist tag. Submit and My Music accept several files at once, ordered by file name.

## fix297 — chat on phones, track comments, Soundbay cards, Outreach

**Chat on phones** (touch only; mouse/pen keep the ⋮ menu): bottom-sheet chat with three stops (peek / half / full); long-press radial menu on a message; pull-down at the top of a room for the catch-up reel; voice-note strips with timed pins (a reply starting `@m:ss ` to the voice note); swipe a message to put the things it links to in the pocket; tether chip; haptic receipts (`navigator.vibrate`, respects reduced motion and `exomusica_haptics`).

**Comments on community tracks**: `CommunityTrackComment`; routes `/api/community-tracks/:id/comments`, voice notes are strip-only (`/api/voice-notes`). Strip cache ids are offset (1e9 community, 2e9 voice) so sources never collide.

**Soundbay**: Playlists and Community albums are cards (hue from the title), with a **+ Create** next to each heading (`CreateBox`). **AZERTY**: Q no longer opens the room switcher while a map is walked with ZQSD (`data-wasd`). **Scan Visor**: hints removed.

**Admin → Outreach** (`/admin/outreach`, backend `routes/outreach.ts`, `lib/outreach*.ts`, `lib/mailMarkdown.ts`):
- *Mail settings*: SMTP (password sealed with AES-256-GCM, key from `OUTREACH_SECRET`, else `JWT_SECRET`), From / Reply-To, default Cc/Bcc, signature, default follow-up days, optional IMAP "file a copy in Sent" (leave off for Gmail & other hosts that already file SMTP mail in Sent).
- *Contact list*: typed columns (text, long text, number, date, checkbox, choice, several choices, link, email, rating), sort, search, "follow-up due", "never written to", CSV import (Google Sheets export), CSV/JSON export, per-row ✉. Last sent / times sent are editable (for mail not sent from the site); sending from the site updates them.
- *Composer*: the studies/articles dialect cut down to what mail carries, plus underline `++`, highlight `==`, `^sup^`, `~sub~`, colour/size `{c:#c0392b s:18|text}`, buttons `[[Label]](url)`, alignment `:::center`, tables. Merge fields `{{first_name|there}}` (any column key). Pictures are inline, audio/files are attachments (20 MB total, 50 recipients per send). Blocks palette grouped by kinds you define (Short bio, Long bio…). Server-rendered preview = what is sent. Follow-up date set per send (+3 d … +1 mo, default from settings). Test send to yourself. Missing merge fields are listed (409) before anything leaves. Draft autosaves in the browser. Mails go out one per ~1.2 s.
- Nav dot on *Outreach* when a follow-up date has come.

### fix298 — Outreach follow-up
- **Dates**: date boxes (Last sent, Follow up, date columns, the composer's reminder) keep a half-typed date; a complete date saves ~1 s after you stop or when you leave the box. Before, a browser date field reported "" while you typed the month and the save wiped it.
- **Colour + size**: they share one span (`{c:#… s:18|text}`): applying the second to the same text updates the span. The renderer also accepts nested spans (`{c:#…|{s:18|text}}`) from older drafts.
- **Groups**: `OutreachGroup` (many-to-many with contacts). Groups column, filter and sort by group, "Add to / Remove from group" on the selection, Groups manager. CSV import reads a `Groups` column (separated by `;`).
- **Contact lists**: export `.vcf` (name, email, phone/organisation/link columns, groups as categories, the rest in the note); import `.vcf`, Google Contacts CSV, Outlook CSV or any CSV.

### fix299 — Outreach: pipeline, Today, templates, scheduling
- **Export**: contacts as one combined `.vcf` or a zip of single cards (`lib/zip.ts`, store-only zip, no dependency). **Import**: a `.vcf` creates a column for every property it carries (Phone, Organization, Title, Website, Address, Birthday, Notes, social profiles, extra emails, X- extras, Timezone) with types (links, dates, long text); groups from CATEGORIES.
- **Pipeline**: per-contact Status (lead → contacted → replied / accepted / declined / no answer; sending moves lead → contacted; replied/accepted/declined clear the reminder), Deadline, Time zone; filter and sort by them; ↩ marks a reply.
- **Today** panel: follow-ups due, calls closing within 14 days, who to write to next (per group), who has gone quiet.
- **Opportunity capture**: paste a link or the text of a call; title, address, deadline, fee are read (server fetch is restricted to public addresses). Creates a Lead with Link/Fee columns.
- **Templates + variants**: save subject/text/block choices; `{{block:Short bio}}` is replaced per person by the block chosen for their group.
- **Follow-up drafts**: quotes the earlier mail and threads under it (In-Reply-To). **Review all**: each recipient's subject and opening line with problems flagged. Preview highlights merged values. **Pitch check**: subject length, greeting, length, a way to listen, a clear ask, attachment size.
- **Plain-text-only** option. **Send later**: queued in the database, drained once a minute by the backend; "at 10:00 in each person's time zone" (Time zone column; yours from the browser) and weekend → Monday.
- **Results**: answer rate by group, template, block version and weekday.

### fix300 — Outreach becomes a shareable workspace (outside Admin)
- **Where**: `/outreach` (entry) and `/outreach/<address>` (a workspace). `/admin/outreach` redirects. The page is lazy-loaded and has no site layout.
- **Workspaces**: one per artist (`OutreachWorkspace`: address, name, argon2 password hash, `tokenVersion`). Entering with the password returns a 30-day signed key (HMAC, `OUTREACH_SECRET` or `JWT_SECRET`), kept in `localStorage` per address; the password is never stored. Changing the password or "Sign out everyone else" bumps `tokenVersion`. Login is rate-limited (8 failures / 10 min per IP+address, 40 / h per IP) with equalised timing. Site admins can open any workspace without a password.
- **Creating**: site admin only, unless env `OUTREACH_OPEN_CREATE=1`. "Move my existing data in" adopts every pre-fix300 row (contacts, blocks, templates, mailbox) into the new workspace.
- **Isolation**: every query goes through `scopedDb(workspaceId)` (Prisma extension that injects `workspaceId`), so a route cannot read another workspace by forgetting a filter.
- **Several mailboxes**: `OutreachAccount` per workspace (SMTP password sealed with `secretBox`). The composer has **Send as**; scheduled mail remembers its mailbox. Settings → Mailboxes (add, default, remove).
- **Collecting**: bookmarklet (opens `/outreach/<address>?capture=<page>`), newsletter paste → calls, RSS/Atom feeds (checked every 6 h by the 60 s scheduler loop) → a **New** inbox you keep or dismiss; contact enrichment (team/contact page); duplicate finder with per-field merge and presets (newest / most complete / combine / oldest); Google Forms and plain HTML forms are read (questions kept in a "Form questions" column, or saved to New).
- **Places**: Place column geocoded through Nominatim (1 request/s, cached) or typed as coordinates; 📍 opens Google Maps (app on phones); **Near…** sorts by distance from a city, address, coordinates or "where I am", with a radius.
- **Past mail / EML**: import `.eml` or `.zip` (limits: 400 files, 10 MB each, 60 MB total); dates, contacts and replies are filed automatically; stray mail (not part of applications) is detected and can be re-sorted; select text in a message → save as a block. Export one `.eml` or everything as a zip.
- **File library**: uploads are de-duplicated (sha1), grouped, re-usable in the composer, and can auto-attach per contact group.
- **Writing/sending**: per-recipient `{{hook}}` column, subject A/B, FR/EN twin blocks (block titled "Name · fr") picked by a Language column, do-not-contact list, rights-checked column (asks before sending), 14-day quiet-period note, optional click tracking (`/o/<code>`; needs `PUBLIC_URL`; Caddy routes `/o/*`).
- **Timing/learning**: 7-day and 2-day deadline ladder, "opens again" dates, snooze with a reason, `.ics` export, Monday digest, best hours (≥ 30 sends), answer-time stats (sets the "gone quiet" threshold), decline reasons, accepted-mail archive → template, fee budget, fit score and look-alikes.
- **Keyboard** (sheet focused, not typing): J/K move, X select, W write, R replied, S snooze, / search.
- **Env**: `PUBLIC_URL` (tracked links, digest links), `OUTREACH_OPEN_CREATE`, `OUTREACH_SECRET` (optional).

## fix301 — Outreach paste/inbox, collaborator discography, notifications in the dock

- **Outreach page** is centred (`.ox-page`, max 1500px).
- **Paste with formatting** (`lib/pasteMail.ts`): pasting rich text into the composer or the signature converts bold/italic/underline/strike/sup/sub/highlight, colour+size spans, links, headings, lists, quotes, tables, images, centre/right alignment into the mail markup. Plain text pastes untouched.
- **Newsletters**: the "Newsletters" tab also imports `.eml` / `.zip` (`POST /api/outreach/newsletter/eml`). Only calls are kept.
- **Inbox checker** (read-only IMAP, per mailbox, every 30 min, `inboxOn`): finds open calls in new mail (newsletters are split into their calls), stores only title/link/deadline/fee into New leads (source "inbox"). Mailer settings: "Look for open calls in my inbox". Manual run: `POST /api/outreach/accounts/:id/inbox-check`. Schema: `OutreachAccount.inboxOn/inboxFolder/inboxLastUid/inboxValidity/inboxCheckedAt/inboxError`.
- **Collaborator discography** uses the Playlist views: `GET /api/collaborators/:slug/playlist` is a virtual read-only playlist (`collab-<slug>`). `PlaylistSpaceMapPage`/`PlaylistPage` read `lib/playlistSource.ts` (`usePlaylistSource`) to pick data URL + links. Routes `collaborator/:slug/spacemap` (`#venn` = constellation) and `collaborator/:slug/list`. Profile shows Constellation / Spacemap / List. Not listed anywhere else. Old `CollaboratorSpacemapPage` removed.
- **Notifications** (desktop): clicking a topic notification/recent message opens the room in the chat dock at that message (`chatDockStore.jumpTo` → `pendingJump`, consumed by `ChannelPage`) without leaving the page. In day/search view the "⇣⇣ Live chat" button now always shows and switches back to live (composer returns). Mobile still navigates. PM notifications still open Post.

## fix302a — audio player: A/B pair, provenance strip, offline album pack, gapless/crossfade

- **Two `<audio>` elements** in `PlayerBar` (`audioStore.bindAudioElement(el, slot)`; events from the silent one are ignored). Audio graph per element: source → ReplayGain → fade → bus → analyser (`audioAnalyser.ts`: `rampFade`, `setFade`, `setActiveForAnalyser`).
- **Gapless / crossfade per album**: `Album.transition` (`none|gapless|crossfade`) + `crossfadeMs`, set in Admin → Albums → edit album. The player asks `GET /api/albums/:slug/transition` once per album (cached). Applies only between consecutive tracks of the same official album, never with repeat-one or an active A/B. One timer (`arm()` in `audioStore.ts`) aims at the next boundary and is re-aimed on every time update; the next file is preloaded in the spare element in the last 25 s. Gapless = next file starts 50 ms early with a 60 ms dip (hides encoder padding). If anything can't run, the plain `ended` path advances as before. Rules are pure in `lib/playTransition.ts`.
- **A/B pair**: expanded player → "A / B compare". Mark in/out for A and B (even on different tracks), `\` flips to the other side at the same distance in; both loop; "free" stops. Regions are drawn on the seek strip.
- **Provenance strip** (expanded player): study › sketch › branch › album, each chip opens its place. `GET /api/tracks/:id/provenance`; set per track in Admin → Albums → track edit ("Came out of study", "Grew from sketch"; `Track.fromStudyId/fromSketchId`). Shown when at least one of study/sketch is set.
- **Offline album pack**: "Save offline" on an album page. `lib/offlinePack.ts` stores tracks, cover, gallery, notes (`/api/albums/:slug`) in Cache Storage; `public/sw.js` serves them (Range-aware) and keeps the app shell, so a pinned album opens offline. The worker is registered only after someone pins and removed when the last pin is removed. `/offline` lists/removes packs and shows storage use.
- Fix: `GET /api/albums/:slug` now returns `contentMarkdown` and the og fields (they were missing, so the admin edit form could blank them on save).

## fix302b: XenoLab (charts, citations, chains, phenomena)

- **Study charts** use the Telemetry Scope look (`.study-scope`, `.inst-*`). Colours are spread around the study picture's average colour (`lib/chartPalette.ts`, luminance floor 0.2 on the dark panel; none if there is no picture). The study background now fades on the sides as well as the bottom (two masks, intersected).
- **Live charts**: a chart can point at a CSV among the study's files (`StudyChart.sourceFileId`); the data is re-read on every `GET /api/studies/:slug`. The note "live · reads file.csv" shows on the chart.
- **Citations**: `[n]` shows a hover card (source, page peek via `/api/link-preview`, other studies citing the same source). `GET /api/studies/:slug/citations`, logic in `backend/src/lib/citations.ts`.
- **Chain builder**: Effects → "Custom chain…". Sliders are named and read out by the plugin itself; the engine loads only when the builder opens. "Copy link to this chain" gives `/xenolab?tab=effects&chain=<code>` (`lib/dsp/chainLink.ts`: base64url JSON, validated; max 8 stages / 16 params). The worker accepts an inline `preset`.
- **Phenomena**: XenoLab tab `?tab=phenomena&item=<slug>`. Model `Phenomenon` (title, summary, markdown notes, chain code, example track, published). Public `GET /api/phenomena`; admin `GET/POST/PATCH/DELETE /api/admin/phenomena`. Admins edit inline on the tab. "Reproduce this" opens the Effects tab with the card's chain.
- Prisma: `fix302b_xenolab` (StudyChart.sourceFileId, Phenomenon).
- Tests: `_scratch/chartpalette|chainlink.test.ts`, `backend/_scratch/citations|phenomena.test.ts`, `e2e_fix302b.py`.

## fix302c: audio region notes + Glossary

- **Region notes**: `TrackComment`/`CommunityTrackComment.endSeconds` (null = a plain moment). In the expanded player, mark A or B in the A/B panel, press "▭ Region", write the note: it spans that stretch (`clampEnd`, min 0.3 s). Regions draw as bands on the strip in the author's colour; clicking one seeks to its start. A region note stays in the caption while the playhead is inside it.
- **Layers**: one chip per author (shown when 2+ people have annotated) switches that author's pins and regions on/off. View-only state, nothing stored.
- **Glossary**: model `GlossaryTerm` (term, aliases, definition). `GET /api/glossary` (public, cached 60 s) returns the terms and the slug of the first wiki page containing a `{glossary` line. Admin CRUD under `/api/admin/glossary`, UI at `/admin/glossary` (it can also create the page).
- **The Glossary page is a normal wiki page** holding `{glossary}`, `{glossary list}`, `{glossary cards}` or `{glossary columns}` on its own line. So it can be nested under any article in the Log with the wiki admin's parent field and take a font; the layout word is its style switch.
- **Auto-links**: in studies and Log articles the first mention of each term/alias (whole words, longest match first, headings skipped) gets a dotted underline and a hover/focus card with the definition and a link to `/wiki/<page>#term-<id>`. Not applied to chat. One regex per document, one request per page load.
- Prisma: `fix302c_glossary_notes` (GlossaryTerm, endSeconds on both comment tables).
- Tests: `_scratch/glossary|specnotes.test.ts`, `backend/_scratch/glossary|clampend.test.ts`, `e2e_fix302c.py`.

## fix303a: community layer

- **Presence constellation** (Members → "Constellation", `?view=sky`): plain SVG, no animation loop. Stars on a sunflower spiral (`lib/constellation.ts`), most active in the centre, size by messages this month; members in a chat now are lit, pulse (CSS only, off under reduced motion) and are joined by a line chain. Click = profile.
- **Mention cards**: hovering/focusing a resolved `@name` in chat shows their bio line, latest study and latest community track (`GET /api/users/:username/glance`, public data only, loaded once per name on first hover).
- **Since-you-left digest** (Home, logged in): after 6 h+ away, one card with replies to you, new messages in followed rooms, new albums, updates to your/followed studies (`GET /api/digest?since=`, capped at 60 days). "Last visit" is a per-device localStorage stamp, written on dismiss and on page hide; a first visit on a device shows nothing.
- **Branch reaction palettes**: `Branch.reactionEmojiIds` (ordered, max 24), set in Admin → Branch → Identity ("Reaction palette"). In that branch's rooms the React menu lists them first, outlined.
- **Quote in a study**: message menu → "Quote in a study…" lists your in-progress studies; the selected words (if any, inside that message) or the whole message are appended as a signed markdown quote with a link back to the message (`POST /api/studies/:slug/quote`, owner only, adds a revision). Mentions are written as @name.
- Prisma: `fix303a_community` (Branch.reactionEmojiIds).
- Tests: `_scratch/constellation|digestui|palette.test.ts`, `backend/_scratch/digest|palette|studyquote.test.ts`, `e2e_fix303a.py`.

## fix303b: DM from anywhere, welcome buddy, credit roles, points ledger

- **DM from anywhere** (`components/DmButton.tsx`): a small mail icon beside names in chat (also the grouped first-author line), on mention cards, member cards, and `<Username dm />` (enabled on community pages, challenges, the Instrument feed). Opens a one-line box; Enter sends via `POST /api/pms/:username` and shows a toast; ↗ opens the whole conversation. Not shown beside your own name or when logged out. Not enabled inside links/cards (a button inside a link misbehaves).
- **Welcome buddy**: on join approval `assignWelcomeBuddy` (`lib/welcomeAssign.ts`) pairs the newcomer with an existing member (recently active first, then fewest greetings waiting, then random: `lib/welcomeBuddy.ts`). The buddy gets an in-app notification (`welcome_buddy`, body "Welcome @name !") and, if they allow private-message emails and `PUBLIC_URL` is set, an email (`WELCOME_BUDDY` template, editable with the others, tokens `newMember`, `welcomeUrl`). The link is `/topic/<first discussion room>?say=Welcome%20%40name%20!`: the chat opens with the greeting in the box (never sent for you; capped at 500 characters; the parameter is removed from the address). Clicking the notification does the same. Home shows "You're a welcome buddy" (up to 3 newcomers from the last 14 days, `GET /api/welcome/pending`); "Say hello" or "skip" marks it handled.
- **Credit roles**: `TrackCollaborator.roles` from a fixed list (composer, lyrics, vocals, instrument, field recording, mixing, mastering, artwork). Admin → Albums → track: toggle roles under each credited person. Album pages show "Name (mixing)"; no roles = plain composer credit, shown as the name alone. Collaborator pages show a summary ("mixing ×3 · composer ×1"). Changing who is credited keeps everyone's roles.
- **Points ledger** at `/ledger` (linked from Rewards): earned shares per member and every earning with its reason, public; spending is never listed; ghosts and deleted members appear as "former member". `GET /api/ledger`, cached 60 s.
- Prisma: `fix303b_welcome_roles` (WelcomeBuddy, TrackCollaborator.roles, EmailType WELCOME_BUDDY).
- Tests: `backend/_scratch/welcome|creditroles|ledger.test.ts`, `e2e_fix303b.py`.

## fix303c — answer feedback with a new version; branch "wanted" slots

**Idea 31: versions.** On a community track the owner can upload a revised file. The old file is kept as a version (max 3, oldest pruned and its storage reclaimed; files count against the owner's quota). In the player, an owner sees "↻ answer with a new version" on other people's unanswered pinned comments; the upload is linked to that comment, which then shows "✓ answered". A collapsible "Versions" list under the strip lets anyone play earlier versions (`preload="none"`, nothing loads until opened); the owner can delete one. Deleting the track removes its versions. API: `POST /api/community-tracks/:id/replace-file?answers=<commentId>`, `GET /api/community-tracks/:id/revisions`, `DELETE …/revisions/:rid`.

**Idea 35: wanted slots.** Admin → Branches → contribution settings has a "Wanted" editor (≤12 slots, title ≤80, detail ≤200, release a claim, remove). The Contribute panel shows a Wanted tile: open slots have a Claim button (`/submit?branch=<slug>&want=<id>`), taken ones show the submission's title. Starting a submission with `wantedId` claims the slot atomically (`updateMany` on a still-open slot); a REJECTED submission frees it, and deleting the album nulls the claim.

Schema: `CommunityTrackRevision`, `BranchWanted`. Migration `fix303c_versions_wanted`.

## fix304a — trash with undo, admin inbox, audit-log search and export

**Idea 44, soft delete.** Deleting a chat message now sets `Message.deletedAt` and keeps its text and files for 30 days (previously files were deleted at once). The author sees an "Undo" button in the toast for 8 s; admins can restore any message later from Admin → Trash (`POST /api/messages/:id/restore`, author or admin; admin restores of others are logged as `message.restore`). Restore re-broadcasts the message to the room. An hourly sweep (and "Purge" on the Trash page) deletes the files for good and blanks the text; the empty tombstone stays because replies point at it. Messages deleted before this update have no `deletedAt` and are not restorable. Deleted messages' files count against the uploader's quota until purged. Scope: chat messages only.

**Idea 41, inbox.** Admin → Inbox lists join requests, pending submissions (with at least one track) and pending reward claims in one list, longest wait first, filterable by kind, each with an Open link. The nav dot on "Inbox" now reflects the total (it used to track join requests only). `GET /api/admin/inbox`.

**Idea 45, audit log.** Filters: free text, admin, from/to (UTC days, inclusive), debounced. "Export CSV" downloads the same filter (up to 20 000 rows; cells starting with = + - @ are neutralised for spreadsheets). `GET /api/admin/audit-log.csv`.

Schema: `Message.deletedAt` + index. Migration `fix304a_trash`.

## fix304b — branch header theme, feeds, "this day in past years"

**Idea 40, header theme.** Inside a branch (its page, its albums, the Contribute panel with a branch selected) the top bar takes that branch's identity colour (the one set in Admin → Branch identity; branches without one get their name-derived colour) and shows the branch name under the logo, linking back to it. One CSS custom property (`--hdr`) on the header, no extra layers. Leaving the page restores the site look. Hook: `useHeaderTheme(slug)`.

**Idea 49, feeds.** `GET /api/feed/branch/:slug` (albums, approved community pieces, tagged studies) and `GET /api/feed/study/:slug` (the study and each saved draft), Atom by default, `?format=json` for JSON Feed 1.1. Newest 50, cached 5 min, hidden branches are 404. Branch and study pages show "Feed · JSON" links and a `<link rel="alternate">`. Set `PUBLIC_URL` so feed links are absolute on your domain (falls back to the request host).

**Idea 50, time capsule.** `/capsule?md=MM-DD` (default today) lists, per past year, albums and studies created that day and the rooms that were active with up to three readable messages, linking to that room's day. Imported Discord days count. Only rooms the public may read. Answer cached 1 h per day. Reached from the archive calendar ("This day in past years →") or by address.

No schema change.

## fix304c — Radio (idea 48)

`/radio` ("Radio" in the desktop top bar): one branch on air at a time, the same song at the same moment for everyone. It is a clock, not a stream: `GET /api/radio/now` computes the branch from the UTC hour, orders that branch's tracks with a seeded shuffle (same for everyone, new each day), and returns the song, how far in it is, and what is next. Nothing runs on the server between requests; the tracks are cached for a minute. "Tune in" starts the song at the broadcast position (a click is needed because browsers block sound otherwise); when the song ends the page asks again and plays the next. Branches with no tracks of known length are skipped.

- **Schedule:** Admin → Radio. Blocks "from hour H for N hours → branch" (UTC, wrap past midnight, up to 24). Hours without a block rotate through the branches that have music in 3-hour parts.
- **Chat:** the room of the branch on air is put in the chat dock while the page is open.
- **Header:** wears the on-air branch's colour (fix304b).
- Limits: official album tracks only (not community pieces); it keeps going on after you leave the page only for the song that is playing, the next song needs the page open.

Schema: `RadioBlock`. Migration `fix304c_radio`.

## fix304d — Jam rooms (idea 47)

`/jam` ("Jam" in the desktop top bar). Members start a room (a 4-character code, easy to read aloud) or join one; up to 6 people edit one shared pattern and each browser makes its own sound. Nothing audio-related touches the server.

- **Instrument:** 4 lanes x 16 steps: Kick, Hat (on/off), Bass and Lead (8 scale degrees each, shown as a small piano-roll). All voices are synthesized (no sample files). Scales are mostly just-intonation: minor pentatonic, Dorian, Phrygian dominant, 5-limit major, plus whole tone. Key (A1-D3), tempo 50-200, swing 0-0.6, per-lane mute/clear.
- **Sync:** the server keeps the room state in memory and relays validated changes (tempo/key/scale/swing/mute/clear/step). Every change is rate-limited (40/s per person) and checked, nothing else is stored. Each browser measures its offset to the server clock with a few pings and schedules notes against that shared clock, so everyone's bar one lines up to within network latency. A tempo change restarts the shared count.
- **Engine:** a 25 ms timer schedules notes 140 ms ahead on a Web Audio clock; voices are throw-away oscillator/filter nodes, a single compressor on the output; the playhead is one element moved with a transform (no re-render per step).
- **Save loop (WAV):** renders two loops with the same voices in an OfflineAudioContext (44.1 kHz, 16-bit stereo) and downloads it; attach it in chat like any file.
- **Rooms:** created via `POST /api/jam`, socket `/ws/jam/:code?token=`; full rooms close with 4409, unknown codes 4404. At most 40 rooms; a room empty for 10 min is dropped.

No schema change.

## fix305 — Scan Visor colours (idea 51)

Admin → Scan visor. Two colours: the visor's own (grid corners, panel, beacons, labels, other travellers' notes) and the colour of your own notes. Six named presets (Scan cyan = the old look, Combat red, Thermal amber, Echo violet, Phazon green, X-ray blue) or any colour. The preview is the real visor markup and CSS placed in the page flow, so it cannot drift from the real thing; a colour with too little contrast on the dark page (< 4.5:1) is flagged. Saving applies at once without a reload; "Reset" stores nothing, so the default stays the default.

How: every hard-coded visor colour in `global.css` became `var(--visor, #5ef2d0)` / `var(--visor-mine, #f5a524)` (panel and text tints are `color-mix` from it); `Layout` sets the two custom properties from `/api/site-settings`. Zero cost per frame.

Schema: `SiteSettings.visorColor`, `SiteSettings.visorMineColor`. Migration `fix305_visor_colors`.

## fix306 — Probe mode (ideas 51–58) + classic mode (99/100)

**Probe mode** (desktop): nav button "Probe" or key `I`. Page dims; scannable things get coloured brackets (lore orange, tracks red, people blue; mod magenta, admins only). Mouse dwell 900 ms or press-and-hold 450 ms fills a bar, then a readout card opens (track, person, lore page, authored point). Completed scans are recorded (`ProbeScan`, localStorage + server when logged in) and the card shows "new" only the first time. Clicks after a completed scan are swallowed (600 ms) so scanning never navigates.
Keyboard: `[` / `]` step through brackets, `Enter` scans, `Esc` closes card then mode.
Implementation: one injected `<style data-probe>` (exists only while on), event delegation, no per-element JS. Colours editable in Admin → Visor ("Probe mode brackets", live preview, contrast warning), stored in `SiteSettings.probeColors`.

**Authored scan points** (extended markdown): `{scan visible words | note}`. Plain text unless Probe mode is on. Key = `point:` + hash(path + words).

**Admin-only marks**: `data-probe="mod"`; first use "Awaiting review" on pending community albums.

**Classic mode** (`lib/classicMode.ts`): Account settings checkbox; hides Probe entirely. Defaults ON when never chosen and the device reports reduced-motion, deviceMemory ≤ 2 or saveData. All later overlay/animation features must respect `html.classic`.

API: `GET /api/scans`, `POST /api/scans {kind,key}` (idempotent, cap 5000).
Deferred: scan-able images (56), touch/phone Probe UX.

## fix307 — Field Log (59, 60, 61, 62, 64, 65)

`/field-log` (links: Probe HUD, Account settings). Sections: **Lore** (wiki pages, studies, branches), **Phenomena**, **Recordings** (albums). Unscanned entries are `???` silhouettes whose names are not in the DOM; each section shows `found/total · %` only (no global percentage).
Catalogue: `GET /api/field-log` (public data, one shared 5-minute cache, ≤400 per section, `lib/fieldLog.ts`). Unlocked = the entry's scan key is in your scans (localStorage, synced to the account on login).
**Phenomena reveal in steps** (idea 62): the XenoLab card has separate brackets for name (`phenom:slug`), notes (`#body`), example (`#ex`), preset (`#chain`); a card only has the steps it actually has, so it can't get stuck below 100%. The log shows lit pips; unscanned step names stay `???`.
**Share card**: canvas PNG drawn once on click (bars + up to 6 unlocked titles, nothing about the person).
**Missing-scans hint**: under study text, "N scan points on this page are still unfound" (counted once after render; never says where; hidden in classic mode).
Generic: any element with `data-probe="lore" data-probe-key data-probe-label data-probe-note` and no fetch is probe-able and reads out its note.
No schema change. Deferred: Ancients (founders/old chat) and recovered-log headers (63), album unlock-by-listening (no listening history exists, so albums unlock on scanning), scan-as-read (53).

## fix308 — Chart, door wipe, save station (66, 68, 69, 71)

- **Door wipe (66)**: `DoorWipe` in Layout, plays only when the first path segment changes (section to section). One fixed element + one 260 ms CSS animation, removed on `animationend`. Never shown in classic mode or under prefers-reduced-motion.
- **Chart (68)**: `/chart` (linked from the Field Log). `lib/chart.ts` lays the branch tree out as a floor plan (depth = column, leaves = rows, parent level with its children) and works out each room's state. Visited = in `exomusica_visits` (recorded by BranchPage) or scanned as `branch:slug`. Heard of = entrance rooms, a visited room's parent and children. Unseen = dark, name not in the DOM, not a link. Hidden branches are never listed. One SVG, drawn once.
- **Pins (69)**: a pin on the room where you last listened (`exomusica_lastplay`, written when the playing track changes), plus a "Continue" list: last heard and every unsaved study draft on this device. Reply-waiting pins are not done.
- **Save station (71)**: under the study editor, "Save point · draft kept on this device at HH:MM". Honest wording: drafts are stored in this browser (localStorage), not on the server.
- No schema change. Not done: doors as access levels (67) and hidden branches as secret rooms (72); both need a decision on what is gated and how hidden branches relate to pages.

## fix309 — Palettes, visor frame, fog loading, forgotten threads (92, 81, 85, 93)

- **Palettes (92)**: Account settings → Colours: Default / Chozo (warm gold, olive, calm) / Phazon (cold teal, 2 px corners, faint red/teal split on h1/h2). `lib/skin.ts` holds the palettes as data and applies them as CSS variables on `<html>` (nothing duplicated in the stylesheet); `contrast()` is used by `_scratch/skin.test.ts` to enforce text ≥ 7:1, dim text and accents ≥ 4.5:1 on both. Stored in `exomusica_skin`. Palettes are not overlays, so classic mode leaves them alone. Branch header colours (`--hdr`) are separate and unaffected.
- **Visor frame (81)**: checkbox in Account settings, class `html.hud`. CSS only: one fixed `body::after` (scanline + vignette, `pointer-events:none`), notched corners on buttons/cards. Off in classic mode.
- **Fog loading (85)**: `<Loading />` replaces the 20 `<p className="home-dim">Loading…</p>` placeholders. One compositor-only sweep (`transform`), static in classic mode and under reduced-motion, `role="status"`. New loading states should use it.
- **Forgotten threads (93)**: `GET /api/channels` now includes `lastMessageAt` (unix s; one grouped query cached 2 min). The forum index tints topics quiet for 60+ days that you also haven't opened in that time (`lib/phazon.ts`; visits kept in `exomusica_thread_visits`, recorded by opening the chat dock or the topic page). Opening one clears it. Static tint only (no animation); the split-colour text shadow is off in classic mode.
- No schema change.

## fix310 — Pickup sounds (83), your own recordings

Nothing is synthesised: the sounds are files the admin uploads (Admin → Visor → "Pickup sounds", one row per moment, any mp3/wav/ogg, 200–400 ms suggested).
Moments: `firstScan` (a new Probe scan), `firstListen` (a track reaches its natural end), `firstReply` (a reply is sent in a chat), `sectionDone` (a Field Log section hits 100%).
- Stored in `SiteSettings.jingleUrls` (Json, `{event: url}`); `POST/DELETE /api/admin/site-settings/jingle/:event`; public `GET /api/site-settings` includes `jingleUrls`.
- Listener side: Account settings switch "Pickup sounds" (off by default, shown only when at least one file exists), "Let me hear them again". Each moment plays once per browser (`exomusica_jingles_done`), never in classic mode, at the SFX volume from the mixer. A moment without a file is silent, never a stand-in.
- Plumbing: any code calls `fireJingle(event)` (`lib/jingleBus.ts`, a window event, no import cycles); `lib/jingles.ts` decides (`shouldPlay`) and plays through the existing one-shot SFX path (decoded buffers are cached).
- "Once" is per browser, not per account, so a new device hears them again.
- Schema change: `jingleUrls`. Migration name `fix310_jingles`.

## fix311 — Scan merged into Probe, card scrolls with the page, slower door wipe

- **One mode.** The old Scan Visor (travellers' notes/traces, "Write on the page", the corner grid) is now the traces half of Probe mode. One switch: faceplate **Probe** button (replaces the Scan button; the header's Probe button is gone), key `I`, or the terminal (`probe`, `scan`, `visor`, `lens` all work). Probe on shows brackets *and* the traces panel ("PROBE · TRACES"); Off (HUD button or `I`) turns both off. `lensStore` and its persisted `exomusica_lens` are removed: Probe starts off on every load, so traces no longer stay on across reloads.
- **Classic mode now also hides the traces layer and the faceplate Probe button** (it is the same overlay).
- **Esc order**: while writing a note, Esc stops writing first; the next Esc leaves Probe.
- **Scrolling**: the scan progress bar and the readout card are portaled into the page and positioned in page coordinates, so they move with the content.
- **Door wipe**: 260 ms → 750 ms, eased (in, brief hold, out).
- Colour settings for the grid/panel/own-notes (Admin → Visor) are unchanged and now belong to Probe.
- No schema change.

## fix312 — "Scan the core" tour (97), Probe on touch screens, build fix

- **Build fix**: clearing a Json column needs `Prisma.DbNull`, not `null` (jingle upload/remove in `siteSettings.ts`). The same fix covers clearing `probeColors` from the Visor admin page, which would have failed at runtime.
- **Tour**: `lib/tour.ts` (stops, order, remembered state) + `components/TourGuide.tsx` on the homepage. Five stops in page order: hero, studies/stats, branches, happening now, join band (stops whose element is missing are skipped; members get three). Visitors who never answered see a small invitation ("New here? Scan the core"); members are not nagged. Start turns Probe mode on; the current stop alone is made scannable (`data-probe*` attributes added then removed, so the homepage carries no permanent brackets); scanning it, or pressing Next, moves on; Skip and Esc end it; Finish stores `done`, Probe goes back off. Classic mode: plain highlight + Next, no Probe. Redo: Account settings → "Take the tour again", or `/?tour=1` anywhere on the homepage. State: `exomusica_tour`. Words live in `STOPS` in `lib/tour.ts`; rewrite freely.
- **Probe on touch**: a tap on a bracket scans it (no follow-the-link); the readout card has **Open** (same-site links) and **Close**; tapping elsewhere puts it away; the HUD says "tap a bracket"; targets are 40–44 px; on narrow screens the HUD wraps and the traces panel stacks beneath it. The traces panel hides during the tour. Mouse behaviour is unchanged (rest or hold).
- **Layout fix found on the way**: the study owner's button row did not wrap, widening the whole page to 481 px on a phone; it wraps now.
- No schema change.

## fix313 — Sealed rooms (idea 72)

- Hidden branches now appear on the Chart as dashed "?" rooms (sealed). Not links; title "A sealed room. Somewhere there is a way in."
- `GET /api/chart` (cached 60 s) sends hidden branches as `{id, parentId, secret, key}` only. `key` = FNV-1a base36 hash of the slug. No name, no address.
- A browser that has visited the hidden page (visits log or scan log) matches the hash, asks `/api/branches/:slug` for the name, and the room becomes a normal visited room.
- New `Branch.chartHidden` (admin checkbox "Not on the Chart at all"): never sent to the Chart, not even as a sealed room. Affects the Chart only, not the space map.
- Tally line adds "· N sealed" when any exist.
- Migration: `fix313_chart`. Tests: `backend/_scratch/chartdata.test.ts`, `frontend/_scratch/chart.test.ts`, `e2e_fix313.py`.

## fix314 — Doors: who can enter (idea 67)

- `frontend/src/lib/access.ts`: one table `DOORS` (prefix → members | staff). Anything unlisted is open. Longest prefix wins; `/jammer` does not match `/jam`.
- `AccessTags` (mounted in Layout) injects one `<style data-access>` of attribute selectors: every `<a href>` to a door the viewer can't use gets a small lock after it (teal = members, rose = staff). No per-link JS; links added later are tagged automatically. Staff get no style element. A link can opt out with `data-nolock`.
- Door wipe edge takes the colour of the destination: amber open, teal members, rose staff (`data-door`).
- Tags are information, so classic mode keeps them. Screen readers get "members only" / "staff only" through the content alt text.
- Cosmetic only; the server still enforces access. When adding a members-only route, add its prefix to `DOORS`.
- Tests: `_scratch/access.test.ts`, `e2e_fix314.py`. No schema change.

## fix315 — Lenses: Thermal and X-ray (ideas 74, 75)

- Probe mode gets a lens switch: chips **Normal / Thermal / X-ray** in the Probe bar, keys **1 / 2 / 3** (ignored in text boxes). The lens lives in `probeStore.lens` and goes back to Normal whenever Probe goes off, so a lens never outlives Probe. Classic mode has neither Probe nor lenses.
- **Thermal** (`lib/heat.ts`, `LensLayer.tsx`): links to pages with a known last-activity time get `data-heat` 0-4 (≤1 day, ≤3 days, ≤1 week, ≤30 days, older). Sources, all existing endpoints: branches (`lastActivityAt`), discussion topics (`lastMessageAt`), studies (`updatedAt`). Pages with no known time stay neutral. One pass when the lens is switched on, then a debounced (250 ms) repaint when the page's DOM changes; no timers while idle, no canvas, no per-frame work. Data cached 2 minutes. A small legend shows cold → warm. Reduced motion drops the glow.
- **X-ray**: dashed outlines on links, headings, images and audio, body text dimmed, plus a panel listing what links to the current page. `GET /api/backlinks?path=/album/slug` (new, cached 60 s, path whitelisted to branch/album/study/wiki/news/u/topic/collaborator/playlist/community-album) searches studies, wiki pages and news posts for a real link to that exact path (so `/album/al1` never matches `/album/al10`) and returns up to 20. Per-page client cache. Tracks and chat messages are not searched yet.
- Phones: the Probe bar moves to the bottom edge and wraps; keyboard hints are hidden on narrow screens, the tap hint stays. Panels sit above it.
- Also: `AlbumPage` no longer throws when no track is playing and the album has no slug.
- Tests: `backend/_scratch/backlinks.test.ts`, `frontend/_scratch/heat.test.ts`, `e2e_fix315.py`. No schema change.

## fix316 — Echo: rings from the playhead (idea 76)

- Where: `EchoRings` sits beside the seek track in both the docked bar and the expanded player. A rung of rings leaves the playhead on each hit in the music; louder hits give brighter, wider rings.
- How (weak-device budget): no canvas. `getRMS()` (the analyser the player already runs) is read about 14 times a second by one `setInterval`. `lib/echo.ts` `makeOnset` is an adaptive detector: it compares the level to its own recent average, so a drone or a held note never fires, and hits closer than 180 ms count as one. At most 4 rings alive; each is one element animated with transform and opacity only (900 ms), removed on `animationend`.
- Nothing runs while paused, in a hidden tab, in classic mode, with reduced motion, or with Echo off. Silence fires nothing.
- Control: an **Echo** button in the expanded player's transport row; remembered as `exomusica_echo` (default on).
- Tests: `_scratch/echo.test.ts` (onset detector), `e2e_fix316.py` (real playback of a generated burst WAV: rings appear, cap, position, toggle persistence, pause, classic). No schema change.

## fix317 — Quick actions: the four-slot fan (idea 77)

- Desktop/keyboard counterpart of the phone hold-fan. Rest the pointer on a message (or Tab into it) and press **A**: a fan of four opens at the pointer: **Reply (R), React (E), Quote (Q), Pin (P)**. Letters are fixed so muscle memory holds; the fan's **order** follows use (most used first, counts in `exomusica_quick`, halved when the total passes 60 so it follows recent habits). Slots can also be clicked, or picked with 1-4.
- While the fan is open its keys take priority (captured and stopped), so P does not shuffle the player and Q does not open the chat switcher. Esc closes. A never fires in text boxes, on deleted messages, for guests, or with a modifier held.
- Reply = the normal reply target. React = the fan turns into the first six emoji (keys 1-6, same call as the ⋮ menu). Quote = a one-line `> name: text` (nested quotes dropped, 240 chars) put at the top of the message box, which gets focus. Pin = a personal bookmark (`POST /api/messages/:id/bookmark`, the existing endpoint) with a toast.
- Cost: one pointermove listener that only stores two numbers, one keydown listener, no polling, nothing rendered until opened. Not an overlay, so classic mode keeps it. The ⋮ menu shows a one-line tip.
- Files: `lib/quickActions.ts`, `components/QuickRadial.tsx`, `RadialMenu` gets an optional key hint. Tests: `_scratch/quick.test.ts`, `e2e_fix317.py`. No schema change.

## fix318 — Soundbay: share a song of a branch, with a moment, and play (extends the playlist links)

- Every Soundbay branch row has a **Share** button. It opens the same share dialog the playlists use (song, "From" time, "Use what's playing now", "Start playing when opened"), listing that branch's songs by album then position. The branch's song list is fetched only when Share is clicked (`/api/branches/:slug/tracks/shuffle`, the endpoint the row's shuffle already uses). No map options, no embed code. The dialog is portalled to `<body>`.
- Link format: `/soundbay?open=<branch>&track=<id>&t=1:23&play=1`. `track` is the same reference the playlist links use (`12` official, `c12` community), `t` accepts the same time formats. With no song chosen the link just opens that branch.
- Opening such a link (no `album=`, `play=1`, first `open=` slug) fetches that branch's songs and hands them to the same `ShareAutoplay` the playlists use: starts at once if the visitor has already interacted with the page, otherwise one "Play" prompt naming the song and moment, then plays from the right second and queues the rest of the branch. A song that has since been removed falls back to the branch's first. Without `play=1` the link only opens the branch and fetches nothing extra.
- Existing `album=<slug>&play=1&track=&t=` links are untouched (`branchAutoplaySlug` returns null when `album=` is present).
- `ShareModal` gains an optional `extra` prop (address parameters carried on the link only, not the embed).
- Tests: `_scratch/share_branch.test.ts`, `e2e_fix318.py` (includes real playback with byte-range seeking and a 390 px check). Test 304d got a 150 ms wait before its sync assertion (it read the DOM before React flushed). No schema change.

## fix319 — player cleanup, cover links, phone sheets

- **A/B + Region hidden.** `AB_TOOLS_ENABLED = false` in `frontend/src/lib/features.ts` gates the A/B panel, the strip stretches and the `\` flip. Flip the flag to bring it back. The Region-note button is removed; existing region notes still draw on the strip.
- **Guests** see a *Join* link (`/join`) where Post was.
- **Cover links.** `PUT /api/community-albums/:id/cover-link {url}` (owner only; http/https only; blank removes). Replaces any uploaded cover and reclaims its file. UI in Manage My Music (`cover-link-<id>`, `cover-remove-<id>`). Validation in `backend/src/lib/coverLink.ts`.
- **Phones.** `html/body { overflow-x: clip }`; Around Here, Pocket, Terminal, Probe bar and X-ray panel end at `--player-height`, so nothing sits under the player. The sideways scroll could not be reproduced in emulation, so this is defensive; report if it persists, with the device.

## fix320 — replacing audio

- **Official tracks (admin → Albums → Manage → Edit track):** a "Replace the audio" box (search the server or upload). Save swaps the file; comments, bookmarks and credits stay on the track. Duration is re-probed, loudness (`replayGainDb`) is reset so it is re-measured, and the spectrogram strip now revalidates (was cached forever under the same URL). Community tracks already had `replace-file`; they also reset loudness now.
- **Studies:** on each audio block the owner (not while editing) gets *Replace recording*: upload a file, or search `GET /api/studies-audio-search?q=`. `POST /api/studies/:slug/replace-audio {from, uploadUrl | trackId | communityTrackId}` rewrites `@audio(from)` and every `{clip:a-b from}` to the new URL, so markers keep their times; clip `img=` pictures are dropped. Only files hosted at `/uploads/` are accepted (the browser tools need to decode them). Old files are released if nothing uses them; a history entry is recorded. Logic in `backend/src/lib/studyAudioSwap.ts`. No schema change.

## fix321 — public jam rooms, live cursors, side chat

- **Open to everyone.** Guests join by code or from the *Open rooms* list in the lobby (`GET /api/jam/rooms`: listed rooms with people in them, 8 s refresh while the tab is visible). Guests get `guest-NNNN` (unique per room). Starting a room stays members-only (keeps the 503 room cap from being burned by scripts); the *Show it in the open list* checkbox makes an unlisted, code-only room. `POST /api/jam {listed}`.
- **Chat.** `{type:"chat",text}` → broadcast `{type:"chat",line}`. Plain text, 300 chars, 5 lines / 5 s per person, the last 40 kept in memory and sent to newcomers. Right-hand panel on desktop, under the pattern on phones.
- **Cursors (desktop with a mouse only, ≥900 px).** `{type:"cur",x,y}` as fractions of the room box, ≤20/s, only sent while someone else is there, relayed to others (never echoed). Drawn by moving DOM nodes (no React re-render); glow glyph + name, colour from the name, fades after 4 s idle, removed on `gone`. Separate throttles, so pointers never starve pattern edits.
- Logic: `backend/src/lib/jamRoom.ts` (`list`, `guestName`, `cleanChat`, `pushChat`, `cleanCursor`). Tests: `_scratch/jam2.test.ts` and a real-websocket one, `_scratch/jamws.test.ts`. No schema change.

## fix322 — admin red lights

`GET /api/admin/attention` returns, per admin panel, a count and the items behind it (`backend/src/lib/attention.ts`, pure rules; `routes/adminAttention.ts`, queries).
- **todo** (solid red): join requests, submissions, reward claims.
- **new** (solid red, clears when you open the panel): studies by others, member questions (Forum topics), deleted messages (Trash). Baseline is `AdminPanelSeen(userId, panel, seenAt)`; the first look starts from "now", so history doesn't flood the lights. `POST /api/admin/attention/seen {panel}`.
- **missing** (ringed red, stays until fixed): branches without description/cover, albums without tracks/cover/description/composer, tracks without genres/duration, collaborators without bio/picture, empty About page, no favicon.
- The nav shows each light with its count; **Needs attention** (first in the nav) shows the total and opens `/admin/attention`, which groups everything with links. Polled every 30 s while the tab is visible. The incomplete-things lookup filters in SQL, is capped at 500 per kind and cached for 60 s, so the poll stays cheap.
- Schema: `AdminPanelSeen` + `User.adminPanelSeen`.

## fix323 — recovered-log headers (idea 63)

Opening an archived day in a chat (calendar or `?day=`) shows a header: `Recovered: 2023-04-12, #drones · 37 entries decoded · 3.5 years down` (`lib/recoveredLog.ts`, styled `.recovered-log`). Live chat is unchanged. Frontend only.

## fix324 — Forum Map "continue" pins (idea 69)

Three small pins on a map node's top-right (`lib/pins.ts`): **●** red, a reply is waiting (your unread notifications that point at that chat); **✎** you left an unsent draft there; **♪** you last listened to that branch (matches the branch's chat, `branch-<slug>`). Drafts are now kept per room in this browser (`exomusica_cdraft_<slug>`, restored on return, dropped when the box is emptied or sent); the last-listened branch is written when an official track starts (`exomusica_pin_listen`). Nothing new on the server, no schema change. Members only.

## fix325 — Add to playlist as an icon

`AddToPlaylistControl` (album and community album track rows) is now one list-icon button (the same glyph as the playlist "View as list" button). Pressing it opens your playlists as buttons; pressing one adds the track, shows ✓ and closes. The `<select>` that widened rows past a phone screen is gone. The playlist list is fetched on first press and shared by all rows for 20 s. The panel is right-anchored and capped at `min(18rem, 100vw - 2rem)`.

## fix326 — pickup jingles once per account

`User.jinglesDone String[]`. `GET/POST/DELETE /api/account/jingles-done` (`routes/dial.ts`, whitelist in `lib/jinglesDone.ts`). On login the client merges the account's list with this device's (`syncJingles`, `mergeDone`), sends up anything only this device knew, and reports each newly played jingle. "Let me hear them again" clears both. Guests keep the old per-browser behaviour. A jingle that fires in the first moments, before the sync returns, can still play once on a fresh device.

## fix327 — Field Log: Ancients (59)

A fourth section, **Ancients**: the founders (accounts linked to a Collaborator) first, then the imported-Discord ghosts (`isGhost`, `DISCORD_IMPORT`, not linked to a real account), one entry per name, capped at 400. Unlocked by probing the person (`user:<name>`, the same scan as any @name); locked ones are `???` with no name in the DOM. Hidden when there are none. Catalogue only (`lib/fieldLog.ts`, `routes/fieldLog.ts`), still one 5-minute shared cache; no schema change.

## fix328 — suit upgrades (89/90)

- Catalogue in `backend/src/lib/upgrades.ts` (`tint`, `frame-spark`, `frame-log`). Holdings in `UserUpgrade`; only the server awards (`awardUpgrades`, called after a new probe scan).
- Hints: `hintLevel` — <3 days since first seen/re-tuned = precise, <10 = vague, else whisper. Earning anything re-tunes the others (`User.upgradeRetunedAt`). `GET /api/upgrades` creates the rows, which starts the fade.
- Perks: personal Probe tint (`:root[data-tint]` overrides `--visor-mine`), avatar frames on profile pages (`avatar-frame-spark`, `avatar-frame-log`). Choice saved via `PUT /api/upgrades/choice`.
- Probe scan POST returns `{earned:[titles]}` when something new is earned; client shows a toast.
- UI: "Suit" section in the Field Log.
- Not built: Thermal/X-ray lens hints, playlist/emoji slots, collective-milestone upgrade.
- Migration: `fix328_suit_upgrades`.

## fix329 — wiki parent, News live numbers, community milestones, playlist cap

- Wiki parent: "top-level" was sent as `undefined` (dropped from JSON), so a parent could never be cleared. Now an explicit `null`; the server rejects a missing parent, itself, or one of its own descendants (`parentProblem`); the editor hides the page and its sub-pages from the choices; saving clears the shared 20 s Log cache (`forgetHubs`).
- News tokens (`backend/src/lib/newsTokens.ts`, stats in `siteStats.ts`, one query batch cached 60 s): `{{TRACKS}} {{BRANCHTRACKCOUNT}} {{COMMUNITYTRACKS}} {{ALBUMS}} {{COMMUNITYALBUMS}} {{BRANCHES}} {{MEMBERS}} {{POSTS}} {{SCANS}} {{STUDIES}} {{WIKIPAGES}} {{PLAYLISTS}} {{MINUTES}}`, `{{BRANCHTRACKCOUNT:slug}}` / `{{ALBUMS:slug}}` per branch, `{{TOGO:X:N}}`, `{{PCT:X:N}}`. Resolved server-side in the News list, post, homepage "Update" card, embeds/OG, featured cards and the newsletter. Unknown tokens stay as typed. Admin list/editor keep the raw text. Add a metric: one line in `siteStats.ts` + `TOKEN_HELP`.
- Milestones (`MILESTONES` in `upgrades.ts`): First hundred (100 tracks → +5 playlists for all), Chorus (5000 posts → Chorus frame for all), Wide lens (2000 scans → +5 playlists for all). Edit targets there. Progress is public in the Field Log Suit tab.
- Playlist cap: base 10 (`PLAYLIST_BASE`) + Deep crate (25 scans, +5) + milestones. Only blocks creating new playlists; admins exempt; nobody loses an existing one.
- Migration: none (no schema change).

## fix330 — 25 community milestones, editable, embeddable

- Catalogue and default numbers: `backend/src/lib/milestonesCore.ts` (pure, tested without a DB); DB side and a 60 s cache in `milestones.ts`. 25 milestones in five arcs; only `m-tracks`, `m-posts`, `m-scans` have a live reward (`live: true`). The rest count and show, labelled "reward being built". `m-hull` counts the other milestones reached.
- Admin → Milestones (`MilestoneSetting` table): change a target (null = default), switch one off. Raising a target past the current count un-reaches it; the "reached on" date is stored when first crossed.
- News embeds: `@milestone(key)` = one card; `@milestones` = the three closest. Titles/text: `{{MNOW:key}} {{MTARGET:key}} {{MTOGO:key}}` follow the admin's number. The public `/api/milestones` is cached 60 s and cards on a page share one request.
- Field Log Suit tab: closest three open, the rest folded.
- Playlist cap and the Chorus frame now read the live (admin-edited) milestones.
- Migration: `fix330_milestones`.

## fix331 — admin profile editor, mass-assignment fixes, Shared lens

- Admin → Users → Manage opens `components/admin/UserEditor.tsx`: username, email, bio, links, admin, storage limit (MB), new password (hashed server-side), clear a worn frame/tint, and the picture: choose a file, drop one, or paste (click the picture box, Ctrl+V: an image, or the address of a file already under `/uploads/`; the Paste button reads the clipboard where the browser allows). Pictures are shrunk to 512 px in the browser (`lib/imageResize.ts`) before upload. Only changed fields are sent. Outside addresses are refused (`hostedImagePath`).
- Server: `PATCH /api/admin/users/:id` is whitelisted and validated (`lib/profileInput.ts`, tested). It checks username/email uniqueness, refuses removing your own admin, ghost accounts have no email/password, and writes an audit-log row (`user.edit`, field names only, never the password).
- Security: `/api/account/profile`, `/notifications`, `/visual-effects` and `PATCH /api/community-tracks/:id` used to write the request body straight to the database (a member could have sent `isAdmin: true`). They now take whitelisted, validated fields.
- Shared lens (milestone `m-sharedlens`, now live): after 500 community scans, the Probe card says how many other members scanned the same thing (`GET /api/scans/seen`, 60 s server cache, a `[kind, key]` index, no request before unlock).
- Reworded the unbuilt Thermal/X-ray milestone texts: those lenses already exist for everyone; the milestones now promise a second reading (community-scan heat) and two-links-away tracing.
- Migration: `fix331_profile_edit` (adds the ProbeScan index).

## fix332 — Thermal "Scanned" reading and Roll call colours

- Thermal lens (milestone `m-thermal`, 1000 scans, now live): a Recent / Scanned switch appears in the legend. Scanned paints links by how many members scanned that page (`GET /api/scans/heat`: one grouped query over the 600 most-scanned keys, cached 5 min, aggregated, no names; log scale in `lib/heat.ts` `buildScanHeat`). The data is fetched only when Scanned is chosen. Before the milestone: no switch, no request.
- Roll call (`m-roll`, 25 members, now live): in the Members Constellation each star takes its member's colour: the Probe tint they chose (`/api/members` now carries `tint`, validated hex), otherwise a stable hue from their name. The Constellation view itself already existed for everyone; the milestone text was corrected to say so.
- Live milestone rewards so far: First hundred, Chorus, Wide lens, Shared lens, Thermal lens, Roll call.
- No schema change in this delivery.

## fix333 — Index (Random fragment) and Echo

- Index (`m-index`, 200 wiki pages, live): the Log's front page gets a **Random fragment** button: `GET /api/log/fragment` takes a random wiki page and a readable prose paragraph from it (`pickFragment`: no headings, tables, lists, embeds or `@` lines; links reduced to text; 60-320 characters). No caching, one count and a few rows. Before the milestone: no button.
- Echo (`m-echo`, 10,000 posts, live): the homepage shows one old message from a public chat, at least 30 days old, text only, readable on its own (40-400 characters, not a command or a bare link), linking to the message (`/topic/<slug>?day=YYYY-MM-DD#m-<id>`). `GET /api/echo` is the same for everyone all UTC day (the day seeds the pick), computed once a day and kept in memory, public cache 10 min. Hidden branches' chats are excluded twice (query filter and `isPublicChannel`). Before the milestone: no section.
- The "map of how pages connect" half of Index was dropped from the milestone text (the Log already is a page tree).
- Live milestone rewards: 8 of 25. No schema change.

## fix334 — Outreach list resize, Spectral wall
- **Outreach**: the contact list has a grip under it (drag, ArrowUp/Down ±40 px, double-click/Home resets). Min 160 px, max 95vh. Remembered per device (`exomusica_ox_list_h`). Height is set on the element directly: no re-render while dragging.
- **Spectral wall** (milestone `m-spectral`): Soundbay → "Spectral wall" chip (`?view=wall`), visible only once reached. Every official track as its 250×20 strip, coloured by branch (hue from the branch name). 48 per page, "Show more".
  - `GET /api/spectral-wall?offset=` (tiles) and `GET /api/spectral-wall/strips?ids=` (base64 strips + `pending`). Both return `locked` before the milestone is reached.
  - Strips come from the same cache as the player (`lib/stripJobs.ts`, shared queue). A call starts at most 2 new drawings and none while 4 are in flight; the page re-asks for pending ones every 8 s, 6 rounds, and not while the tab is hidden.
  - Official tracks only; community tracks later. No schema change.

## fix335 — Chart layer (`m-chart`, 150 members)
- `GET /api/chart/pulse`: `{locked, pulses:{branchId: 1..3}}`. Source: first-scan dates of `branch:<slug>` ProbeScans in the last 7 days. Levels: 2–3 people = 1, 4–9 = 2, 10+ = 3; fewer than 2 = nothing. Hidden and chart-hidden branches are never included. One grouped query, cached 5 minutes.
- ChartPage asks only after `m-chart` is reached; glow is an opacity-only CSS animation (off for reduced motion).
- No schema change. Pure logic in `lib/chartPulse.ts`, tested in `_scratch/chartpulse.test.ts`.

## fix336 — Founders' door (`m-founders`, 50 members)
- `/vault` (`VaultPage`): the earliest recovered Discord logs (`Message.importedFrom` starting `discord:`), played one line at a time (2.6 s step, Play/Pause/Replay, prev/next, scrubber). Only the last 10 lines are in the DOM; the timer runs only while playing and the tab is visible.
- `GET /api/vault`: locked until reached; up to 80 plain-text lines (`plainExcerpt`), public channels only (`PUBLIC_CHANNEL_FILTER` + `isPublicChannel`), no deleted/trashed messages, no links or files. Cached 10 minutes.
- Field Log's Ancients section shows "Open the vault →" once reached (the section itself is hidden when there are no Ancients).
- No schema change. Logic in `lib/vault.ts`, test `_scratch/vault.test.ts`.

## fix337 — Commons pack (`m-commons`, 500 community tracks)
- Soundbay → Community albums shows a "Commons pack" box once reached. Source: community tracks whose creator-set permission is `CREDIT_REQUIRED` or `FREE_REMIX` (the existing upload setting), uploaded files only, from albums that aren't a pending/rejected submission.
- `GET /api/commons-pack` (month, how many are eligible, ready/building, size), `POST /api/commons-pack/build` (login, 4 per 10 min), `GET /api/commons-pack/download` (public plain link, 20 per 10 min per IP).
- The draw is seeded by the month (same month = same pack): up to 40 files and 200 MB, plus `CREDITS.txt` (title, creator, permission). The ZIP is stored, not compressed (audio doesn't compress, so building costs almost no CPU), built one at a time, only when someone asks, written to `uploads/commons/commons-YYYY-MM.zip`; older months' files are deleted when a new one is built.
- No schema change. Logic in `lib/commonsPack.ts`, test `_scratch/commons.test.ts`.

## fix338 — Jam grows (`m-jam`, 50 community albums)
- Rooms hold 8 instead of 6 once reached. `JamRooms.limit` (6 or `BIG_MEMBERS` 8) is refreshed from the cached milestones at start and every 60 s, never on the join path. `/api/jam/rooms` rows now carry `max`; the lobby shows `people/max`. A room already over a lowered limit keeps everyone; new people can't join.
- "Print to draft album" in a room (logged-in members, once reached): renders four loops in the browser (`renderLoop`, same voices as the live sound), creates a normal community album "Jam CODE (draft)" owned by the person who pressed it (description names everyone in the room), and uploads the WAV as its one track (`LISTEN_ONLY`, track composer = the room's non-guest names). It is a normal community album, not a hidden state: rename or delete it like any other.
- No schema change. Tests: `jam2.test.ts` (limit), `e2e_fix338.py`.

## fix339 — Collective jingle (`m-jingle`, 150 tracks)
- There was no built-in jingle: pickup sounds are the admin's recordings. Once reached, a moment (first scan, first listen, first reply, section done) that has **no admin recording** plays a short motif instead; a moment with a recording keeps it. Same rules as before: off unless the listener switched pickup sounds on, never in classic mode, once per account per moment.
- The motif is read from measured spectral strips (no audio is decoded): `GET /api/collective-jingle` picks 8 community tracks by month (creator allows reuse, uploaded, public album), takes up to 4 whose strip is already drawn, and for each the band that stands out most in each half of the track; each band becomes a note on a minor pentatonic ladder. Up to 8 notes; needs at least 2 tracks. Missing strips are drawn in the background, at most 2 per refresh and none while 4 are in flight; until then the endpoint says `ready:false` and nothing plays (and the moment is not used up). A finished motif is cached for an hour, an unfinished one retried every minute.
- Client: `lib/motif.ts` plucks the notes with triangle oscillators on a short-lived AudioContext; the seed is requested only when a jingle would actually play. Settings shows whose tracks it was read from this month; the pickup-sounds toggle now also appears when the milestone is reached (not only when the admin has recordings).
- No schema change. Tests: `collective jingle` unit test (`cjingle.test.ts`), `e2e_fix339.py`.

## fix340 — Scan map (3D branch explorer) and Second ring (`m-ring`, 20 branches)
- `/explore` (`ExplorePage`, `BranchExplorer`): the branch map as a full-screen wireframe world, styled after a ship's scan map. Reached from Soundbay ("Scan map" button) and the Chart ("3D map" link). Esc / Exit goes back (or to Soundbay if there is nothing to go back to).
- **World** (`lib/hullLayout.ts`, pure): the root is a big stacked ring at the centre; branches sit on rings around it, each taking a slice of its parent's slice by leaf count, ring radius grown so neighbours never touch. Floors: a room is usually on its parent's floor, now and then one step up or down. Each branch's room shape (box, 8-sided drum, hexagonal tower, flat slab) comes from a hash of its slug, so it is the same for everyone and between visits; size grows with its tracks. Rooms are joined by pipe corridors with a dog-leg; where the floor changes the pipe ends in a vertical shaft marked **E**. The admin's old posX/posY hints are not used here.
- **What you see** is the Chart's logic (`roomStates`): visited = orange, heard of = pale blue, not found yet = dim outline and `???`, sealed = violet. Green dots on the doors between two visited rooms; green diamond over the room you last listened to; blue ring on the branch that is playing; Chart layer's weekly pulses (when reached) as a blue wash on the roof. Names show for rooms you know when close, and for the hovered/selected one. A compass disc turns with the view.
- **Second ring** (`m-ring`): once reached, hidden branches appear as sealed rooms on an outer ring (dashed spokes to their nearest visible ancestor), with no name or address. Before that they are left out of this map entirely (the 2D Chart still shows them).
- **Controls**: drag = rotate, wheel / pinch = zoom, Shift-drag / right-drag / two fingers = move, tap or click = select (card with Open / In Soundbay). Keys: arrows turn, +/- zoom, WASD or Shift+arrows move, T top view, R reset, N/P next/previous room, L legend, F full screen, Enter opens the selected room. A hidden list of the rooms you know (as links) is there for screen readers.
- **Cost**: one canvas, a hand-written projector (`lib/hullCamera.ts`), no 3D library. It draws only when something changes; while dragging it leaves out the translucent fills (they come back 200 ms after you let go); pixel ratio is capped at 1.5; strokes are batched into one path per colour and depth band. Idle = zero frames.
- Data: the Chart's nodes (`/api/chart`, now loaded through `lib/chartLoad.ts`, shared with the Chart page) plus the home list for track/album counts. No new endpoint, no schema change.
- Tests: `_scratch/hull.test.ts` (layout, meshes, camera, panning, picking), `e2e_fix340.py`.

## fix341 — scan map controls, free look, hex door, header legibility

- **Keys by position.** `BranchExplorer` reads `e.code`, so the keys in the W/A/S/D positions move on any layout (Z/Q/S/D on AZERTY). Rooms are now Q (previous) / E (next) by position, so nothing collides with the global "Q opens Rooms" shortcut: handled keys call `stopPropagation`, so no window shortcut fires under the map. Bar hints show the real key labels via `navigator.keyboard.getLayoutMap()` (Chromium; other browsers show the QWERTY names).
- **Free head movement.** No pitch clamp: `wrapAngle` normalises yaw and pitch, upside-down view flips the yaw drag and left/right arrows (`upsideDown`), T toggles top view (`isTopView`). Fly-to takes the shortest way round.
- **Legend.** "Visited by others this week" removed; pulses stay off behind `SHOW_PULSES` in `ExplorePage`.
- **Door** (`DoorWipe.tsx`, `lib/doorRoute.ts`, `lib/loadWatch.ts`). Six wedge panels in one SVG slide in from outside the screen (`closing`), hold (`closed`) while the next page loads, then slide out (`opening`). Link clicks that change section are held in capture phase, the door closes, then the click is replayed so the link's own handlers and router navigation run exactly as usual. Navigation not from a click (history, `navigate()`) closes the door over the new page. It opens when the target is shown, `api()` has nothing in flight (counter in `loadWatch`), no `.fog-load`/`aria-busy` element is present, quiet ≥120 ms, shut ≥250 ms; hard cap 6 s. Colour: `--door` on `.door-wipe`, the destination branch's lifted colour (`/branch/:slug`), else the access-level colour. Add `data-no-door` to a link to skip it. Classic mode and reduced motion never show it. The door blocks pointer input while shut.
- **Header floor.** `lib/legibleColor.ts` `lift(hex, 0.25)` pulls dark branch colours toward white (hue kept) in `themeOf`, used by the header name, "Soundbay" link and door.
- Tests: `hull.test.ts`, `door.test.ts`, `e2e_fix341.py`; 284, 308, 309, 311, 314, 340 adjusted for the door/keys.

## fix342 — stronghold door (default), hex door kept

- `lib/doorShape.ts`: nine curved spikes that wind clockwise into the middle (`blade(i)`), octagon frame, corner mask. Landscape picture is 160×100; portrait uses viewBox `-50 -80 100 160` with the content turned 90° (`isPortrait(innerWidth, innerHeight)`, read when the door starts closing; `data-portrait` on the element).
- `DoorWipe.tsx` renders either variant; all load-waiting/click-replay logic is shared. Stronghold: spikes arrive from outside along wide ellipses while rotating (`sh-in`, small settle so they "cling"), 16 ms stagger per spike; leaving, they swing out the way the spiral turns (`sh-out`); a dark octagon fades in behind them so no page shows through the gaps; the frame fades after the spikes leave. Last spike's `animationend` drives the phases.
- `lib/doorStyle.ts`: `exomusica_door` = `stronghold` (default) or `hex`. Settings → "Door between sections". The hex door is untouched and is the safe fallback.
- Tests: `door2.test.ts`, `e2e_fix342.py`; `e2e_fix341.py` pins `hex`; 311, 303b adjusted for the longer closing.

## fix343 — Crate radio, Long wave, X-ray two links, Season shift

No schema change.
- **Crate radio (m-crateradio) and Long wave (m-longwave).** `GET /api/radio/station/:crate|longwave` (`routes/radio.ts`): locked → `{locked:true}`. Both are clocks, not streams: position = seconds since `STATION_EPOCH_MS` (2026-01-01 UTC) located in a loop (`locate`). Long wave = every track of visible branches with a length, shuffled with a fixed seed; Crate = all playlists' official tracks (community tracks are not included), playlists shuffled each UTC day and played through in order, credit `{title, owner, slug}` per song. Lists are rebuilt at most once a minute and hold only id/length/titles; the one track on air is fetched in full per request. `RadioPage` shows tabs only for unlocked stations, `?station=crate|longwave`; a locked station in the URL falls back to the branch radio.
- **X-ray two links (m-xray).** `GET /api/backlinks?path=…&depth=2`: locked → first ring only. Unlocked → `{hits, second}`; up to 8 first-ring pages are searched in turn (cached a minute), `secondRing()` drops the page itself, first-ring pages and repeats, remembers the page each came through (`via`). Frontend asks `depth=2` only when the milestone is reached; otherwise the old request.
- **Season shift (m-season).** 90-day eras by site age (`lib/era.ts`: Ember, Lichen, Moss, Tide, Dusk, Orchid, cycling). The four accent variables are rotated 52° per era with lightness solved so each colour keeps its original brightness (contrast unchanged). A chosen skin wins; era 0 changes nothing. `useSeasonShift` (Layout) reads the cached milestone list. Optional hum (`lib/eraHum.ts`, Settings checkbox, off by default): three sine partials through a low-pass, root note per era; stops while the main player plays, when the tab is hidden, and in classic mode; no audio engine is created until switched on.
- Tests: `radio.test.ts` (stations), `backlinks.test.ts` (second ring), `era.test.ts`, `milestones.test.ts` (live list), `e2e_fix343.py`, `e2e_fix343b.py`.

## fix344 — door sound fix and Hunters-style look

- **Double click sound.** The door holds a link click and replays it once shut; the Layout link-sound listener ran on both. `lib/doorReplay.ts` (`isDoorReplay`/`setDoorReplay`) marks the replay and the sound listener skips it. `e2e_fix344.py` counts `AudioBufferSourceNode.start` across a door transition (exactly one).
- **Look.** Stronghold door now has: a double neon frame (wide blurred glow, bright tube, pale core line), a seamless dark mossy tile drawn once on a canvas (`lib/doorTexture.ts`, ~64×64) behind the spikes, fine vertical scanlines (under and faintly over the spikes; they turn with the door in portrait), a vignette, faint spiral marks in the wall, and spikes with a pale stone ridge plus coloured edges.
- **Colour.** The door is `neon()` (`lib/legibleColor.ts`: saturation ≥ 0.92, lightness 0.58, kept ≥ 0.12 luminance) of the destination branch's colour, else of the site primary (`--accent-forum`, so it follows the era and skin). The old access-level colours (orange/teal/pink) are no longer used; `data-door` still carries the level. Hex door uses the same colour.

## fix345 — Offline cache (m-offline)

No schema change, no new server code. The album pack already existed for everyone; the milestone adds **playlists**: once reached, a playlist page shows "Save offline" (`OfflineButton kind="playlist"`). `lib/offlinePack.ts` `pinPlaylist`/`unpinPlaylist` store `/api/playlists/:slug`, every own-site audio file (official and community tracks) and cover in the same Cache Storage as albums, with provenance for official tracks; bookkeeping in `exomusica_offline_playlists`. Removing a pack deletes only files no other album or playlist still uses (`freeable`), and the service worker is dropped when nothing is saved. `public/sw.js` serves `/api/playlists/:slug` network-first with the saved copy as fallback. `/offline` lists playlists beside albums. Pure parts in `lib/offlinePlaylist.ts`. Tests: `offlinePlaylist.test.ts`, `e2e_fix345.py`. Playlist tracks hosted on another site are not saved (own-site files only).

## fix346 — Signal storm (m-storm)

No schema change. `lib/storm.ts` (backend): the storm is the 48 hours after the milestone's `reachedAt`; meter = new `ProbeScan` rows in that window against `STORM_GOAL` (1000). `GET /api/storm` (`routes/storm.ts`, cached 30 s, an ended storm 1 h): locked / active / ended with count (capped at the goal), `full`, and, only when ended **and** full, the `artifact` `{seed, total, arms}` where arms are the nine most scanned things (people never named, points never shown). Until the storm ends nothing about the Artifact leaks. Frontend: `/storm` page (meter, countdown, Artifact canvas drawn once at DPR ≤ 1.5, "Hear it" = nine triangle-wave notes from the seed and counts, started by the click), `StormBanner` on the homepage while it runs and for a week after (nothing is requested before the milestone or long after). Tests: `storm.test.ts` (both sides), `e2e_fix346.py`.

## fix347 — walkable 3D branch room (`/branch/:slug/room`)

No schema change. An **alternate link** to a branch (not a replacement yet): "Walk into this room (3D)" on the branch page, "Walk in" on the Scan map card.
- **Layout follows the Scan map.** `lib/roomWorld.ts` `buildRoom()`: footprint from the branch's map shape (box 4 sides, oct 8, tower 6 tall, slab 6 low, ring 16). One door per link on the map (parent, children, sealed rooms hung from it), placed on the wall at the position nearest that neighbour's map direction (`atan2`), relaxed to a minimum gap, never across a corner. Open when the neighbour is `visited`/`heard` (`roomStates`), else a nameless sealed door. Being in a room records the visit, so its neighbours are always open; sealed doors appear for outer-ring (Second ring) rooms. Radius capped at 8 m. Unknown slugs get a door-less room.
- **Things in the room:** one pedestal per album (max 10 + "All N albums") on a ring, in the slots farthest from the doors, opening `/album/:slug`; a chat terminal on the emptiest wall → `/topic/:channel`.
- **Moving:** `lib/roomView.ts` (pure): eye, `stepEye` with wall half-plane + pedestal collision, `doorWalkedInto` (walk into an open door to go through), `facing` (35° cone; doors 4.5 m, props 2.7 m) gives the prompt and what Use does. Locked door: toast, nothing else.
- **Travel:** a hidden `<a data-door-always>` is clicked; `doorTarget` has a new `always` flag so room→room (same section) plays the stronghold door in the next branch's colour. Arrive inside the door you came through (`?from=`), looking in.
- **Controls:** keys by physical code (W A S D move, ←→ and Q E turn, ↑↓ and PageUp/PageDown look, Shift run, Space/Enter/F use, Esc leave); mouse drag looks, click uses; touch: `RoomStick` (pointer events, left, forward/strafe, full push runs), drag on the room to look (a touch drag never uses), big Use button, Back and Map buttons. Screen-reader list: "Face the door to X" buttons and real links to albums/chat.
- **Light:** `lib/roomPaint.ts`: 2D canvas painter's algorithm, near-plane clipping, lines and flat fills only, nine-spike doors clipped to the door quad (only within 16 m), small plan map in the corner. Drawn only while something moves (rAF stops when idle), DPR capped 1.5 (1 on ≤4 cores), input kept in refs. CSS scanline overlay.
- Tests: `room.test.ts` (door direction/spacing/edges, states, spawn, collision over 4000 steps, door trigger, facing, clipping), `door2.test.ts` (`always`), `e2e_fix347.py` (desktop keys, door trip there and back, sealed door, Esc, branch-page link, unknown room, portrait touch stick/look/Use). Touch is tested with synthetic pointer events only.

## fix348 — people in the room, terminals, look with the arrows

No schema change (presence is in memory only).
- **Arrows:** ↑↓ look up/down, ←→ and Q E turn, W S move. (PageUp/PageDown still look.)
- **People in the room.** Backend `lib/roomHub.ts` (pure, tested in `roomHub.test.ts`) + `routes/roomPresence.ts`: websocket `/ws/room?token=&room=<slug>`; client sends `{t:"pose",x,z,yaw}` (≤5/s, a heartbeat every 5 s when still); server drops bad/too-fast poses, clamps to ±40, max 40 per room, forgets people after 15 s of silence, shows a person once even with two tabs, and every 250 ms sends `{t:"others",list}` only for rooms that changed (one shared timer, stopped when nobody is in a room). Nothing is stored. Frontend `lib/roomNet.ts`: opens nothing for guests or for people who chose **Hidden** (`exomusica_room_visible`=0; hiding is symmetric: you do not see others either), reconnects up to 5 times, smooths positions (`glide`). Figures are a lit capsule with a visor toward their facing and their name (colour from the name hash — not the member colour yet); drawn in the same far-to-near order as pedestals. The title shows "N here".
- **Terminals.** Pedestals now carry a leaning screen. Using one opens a **screen over the room** (`RoomTerminal`: irregular rounded bezel, glow in the branch colour, scanlines, quick switch-on; the room keeps still and ignores input while it is open, Esc closes the screen first, then the room): album → `AlbumTerminal` (cover, tracks with lengths, play from any track, queue, "Open the page"); "All N albums" → list then album; chat → `MiniChat` (login prompt for guests). Screen-reader/keyboard: "Walk up to: …" buttons plus links to the full pages.
- Tests: `roomHub.test.ts`, `e2e_fix348.py` (mock websocket: join, pose rate, others drawn, hide, arrows, terminal open/close, room frozen while open, chat), `e2e_fix347.py` updated for the arrows. Multi-user was tested with a mocked websocket only; try with two real accounts.

## fix349 — the drone (the audio player in the room)

No schema change, no server code. A small drone hovers ahead and to the right of you in every branch room and *is* the global audio player.
- `lib/roomDrone.ts` (pure): `droneHome` (ahead 1.15, right 0.45, height 1.35, bobs only while music plays), `stepDrone` (glides toward home at ~4.5/s so it trails when you turn or run; kept inside walls and out of pedestals through `collide`; reports whether it moved). `exomusica_drone`=0 means "sent away".
- Look (`paintDrone`): lit hexagon, a ring that turns and breathes while playing, glow, track title under it; amber when paused; "tap me" when nothing is loaded.
- Interact: tap/click it (hit radius from where it was drawn; works with a finger, a tap never moves the view), key **C**, or the **Drone** HUD button. It opens `DroneTerminal` on the same terminal glass: now playing (album link, playlist), seek bar, prev / play-pause / next, shuffle, repeat, the **queue** (click a line to jump there), clear queue, "Send the drone away" (the HUD button brings it back).
- Light: nothing repaints while idle and nothing plays. While music plays the room repaints ~11×/s (not 60) and only when the tab is visible; sending the drone away removes that cost.
- Tests: `drone.test.ts` (follows, settles, never in walls/pedestals, rests), `e2e_fix349.py` (visible and positioned, idle = no repaint, returns after moving/turning, tap/C/button open it, playing/queue/next/prev/shuffle/repeat/clear, away and back, phone tap).

## fix350 — room performance + lock-on

No schema change, no server code.
- **Adaptive resolution** (`lib/roomPerf.ts` `ScaleGovernor`): measures paint time per frame; steps the canvas pixel scale 1 → 0.85 → 0.7 → 0.55 → 0.42 after sustained slow frames (>11 ms), back up after a long run of fast ones (<4 ms), 2.5 s hold between changes; from step 3 on, also caps to 30 fps. CSS size is unchanged, so the room just looks softer on weak devices.
- **Allocation-free painter**: `RoomPainter` class with preallocated Float64 scratch buffers, no per-frame arrays/closures/strings; `facing()` builds its target object only for the winner. Measured in the browser with the heap sampling profiler: ~0.4 KB per frame (was several KB). Dataset debug attributes are throttled to 100 ms and flushed when the loop idles.
- **Door prefetch** (`lib/roomPrefetch.ts`, `lib/sharedGet.ts`): walking toward a door fetches the room behind it (branch + albums) through a shared GET cache, so arriving costs no requests and no duplicate fetches.
- **Lock-on** (`lib/roomLock.ts`): right mouse button, **Z**, or the Lock button (touch). Picks the most centred/nearest person, door, terminal or pedestal inside a cone (reach 14); the view follows the target, strafing circles it, turn keys are ignored while locked; drops when the target leaves (22) or is lost. The prompt shows "Locked: …".
- **Debug:** `?perf` shows ms avg / p95 / scale / polygons; `?perfmul=N` multiplies measured paint time (test hook for slow devices).
- Tests: `roomperf.test.ts`, `paintbench.ts` (node alloc bench), `e2e_fix350.py` (19 checks).

## fix351 — corridors and seamless doors

No schema change, no server code. Doors between branch rooms no longer play the stronghold-door page transition. They open onto an explorable corridor, and the room at its end is already there.
- **Layout** (`lib/roomScene.ts`, pure, `scene.test.ts`): one coordinate frame holds the room you are in, the corridor and the room behind it. The far room sits where the Scan map puts it (offset along the map direction, ×2.6, kept between 9 m and 48 m of corridor), unrotated, so hand-off is a plain subtraction. The corridor runs from the door to the far room's door that leads back: a lead-in out of each door along its wall normal, a direct leg between them, or an L / S-bend if the direct leg would cut through a room or turn too sharply. Walls are mitred, 2.1 m wide, 3.05 m high. Built from the same end (lower slug) whichever way you come, so it is the same corridor both ways. Map shafts (levels) are not modelled: the floor is flat.
- **Two rooms at a time.** The page (`BranchRoomPage`) keeps the room you are in plus at most one `next`. Walking within 6.5 m of a door that leads somewhere asks for the room behind it (`wantNext`: branch, albums and theme through the shared GET cache, world built as if you had visited it); walking to another door replaces it; walking away drops it. Nothing is loaded ahead while you stand in the middle of a room with no door near.
- **The door opens.** Within 4.4 m of the door, once the next room is ready, the corridor is built and the iris opens (0.4 s). You see down the corridor, and the room at the end through its own door (portal rendering: the view through each doorway is clipped to the doorway and drawn in the neighbour's frame; walls you look through from behind are skipped). If the room is not there yet the door waits ("Opening…"); only after 2.5 s without it does it fall back to the old page-transition door.
- **Walking through.** Movement resolves to the nearest point of the union of room, open corridor and far room (`resolveMove`), so the doorway is a gap only while the door is open, and sliding along walls and corners works. Crossing the far room's doorway makes that room the one you are in: eye, drone and lock are translated, presence reconnects to the new room, the address changes in place (`history.replaceState`, no navigation), recordVisit runs, and the page promotes `next` to the current room.
- **The door shuts behind you.** Once you are over 5.4 m from the door of the room you are in, the door closes (0.4 s) and the room you came from is dropped (the page keeps only the room you are in; the one behind lives in the closing link until it shuts). Stay near it, or in the corridor, and it stays open. Walking back works the same way.
- **Light.** Corridor and far room are drawn only through open doorways and clipped to them; the corridor view is ~70 polygons. Everything else is unchanged: nothing repaints when you stand still.
- Debug attributes on the stage: `data-space` (`cur`/`corridor`), `data-link` (`slug:openness`), `data-room`.
- Tests: `scene.test.ts` (30 map links walkable both ways, the same corridor from either end, shut door is a wall, hand-off lands on the same point), `e2e_fix351.py` (door opens gradually, room → corridor → room, only the room behind your door loaded, address follows, presence moves, door shuts behind you, corridor wall holds, backing out), 347/350 updated (doors no longer navigate).

## fix352 — Echo visor + Lore logbook

**Schema change:** new table `LoreEntry` (owner-authored lore, one row per scan address). Run the Prisma commands from the delivery note (migration `lore_entries`).
- **Echo visor** (key **V** / Ping button): a milestone perk, `m-visor` "Echo visor", 1500 community SCANS (admin can lower the target). Until then V says how far the community is. A ping sends a ring (9 m/s, range 18 m, cooldown 2.2 s); answers stay for 7 s. Sealed doors answer with their own colour and a note (pentatonic from G3, fixed by the door's hull key, so it is the same for everybody); unscanned scannables get an amber diamond. Sound only when pinged (blip, wall ticks, bells). Code: `lib/roomEcho.ts`, `lib/roomEchoAudio.ts`, painter `echo()`.
- **Lore logbook** (key **X** scan, key **L** / Logbook button): hold a scan 0.9 s on the locked (or best-centred) thing within 10 m; leaving the cone cancels it ("Scan lost"). Scannables per room: wall inscription `branch:<slug>`, terminal `room:<slug>/terminal`, albums `album:<slug>`, open doors `room:<slug>/door/<to>`, sealed doors `room:<slug>/seal/<hullKey>`. A result card shows for 9 s; rescanning just shows it again. Scans are recorded like any other scan (kind `lore`), so they count toward community SCANS milestones.
- **Owner lore:** admin page "Room lore" (`/admin/lore`, API `GET /api/lore`, admin POST/PATCH/DELETE `/api/admin/lore`). Without lore, a plain description is shown.
- **Logbook:** localStorage (`exomusica_logbook`, `exomusica_logbook_rooms`): per-room list, completion % over rooms visited on this device, unscanned items show as ???.
- **Fixed on the way:** the room loop stopped repainting during the 7 s hold phase of the echo; it now keeps running while echoes are visible.
- Tests: `echo.test.ts`, backend `lore.test.ts`, `milestones.test.ts`, `e2e_fix352.py` (20 checks).

## fix353 — Morph ball

**Schema change:** `Track.waveProfile` and `CommunityTrack.waveProfile` (nullable text, column `wave_profile`). Run the Prisma commands from the delivery note (migration `wave_profile`).
- **Where:** the **Morph ball** button in the expanded player opens a full-screen overlay for the track that is playing (`components/MorphBall.tsx`).
- **What you see:** the ground is the track's loudness (hills), its colour is the brightness (spectral centroid: deep blue-violet dull → gold bright), the ball sits on the ground at the playhead and rolls exactly the distance the music moves; its outline gets spikier the brighter the sound. The bookmarks are pylons (save points); passing one names it. A small whole-track strip sits at the bottom.
- **Controls:** playing, the ball rides the music. Hold **← → / A D** to roll the head (starts at 0.6×, climbs to 6× over 1.5 s; the player is seeked at 10 Hz so you hear it scratch). **Q / E** jump between save points, **Space** play/pause, **Esc** leaves. Touch/mouse: drag the ground, tap a pylon or the strip, hold the ◀ ▶ buttons.
- **The profile** (`lib/waveBall.ts`, `lib/waveLoad.ts`): 720 slices × (amplitude byte, brightness byte), base64, 1440 bytes. The first listener's browser decodes the track once at 22.05 kHz (≈0.2 s of analysis for 5 minutes, the decode dominates), POSTs it (`POST /api/tracks/:id/wave-profile`, community: `/api/community-tracks/:id/…`; first one in wins, validated by `backend/src/lib/waveProfile.ts`), and everyone after gets it from `GET` with no decoding. Replacing a track's file clears it. Tracks the browser cannot decode (host without CORS) show a short message.
- **Light:** the loop runs only while the overlay is open and visible, stops repainting when paused and untouched, repaints ~84 slice-quads per frame, reuses the ScaleGovernor (lower pixel scale / 30 fps on slow devices).
- Debug attributes on the stage: `data-t`, `data-dir`, `data-drawn`, `data-scale`, `data-ready`, `data-marks`.
- Tests: `waveball.test.ts`, backend `waveprofile.test.ts`, `e2e_fix353.py` (19 checks).

## fix354 — Echoes of members

**No schema change** (server memory only, so echoes are lost when the backend restarts).
- **What:** in a branch room you see faint figures retracing what recent members did there. They fade in, walk the path they walked (up to the last minute of a visit), fade out, wait ~6 s and come round again, each on its own phase. Label: "name · 3 h ago" (only when close). An echo is hidden while its owner is in the room for real, and while it is outside the walls (it leaves through a door).
- **Recording** (`backend/src/lib/roomGhosts.ts`, `GhostStore`, wired in `routes/roomPresence.ts`): each live room socket records a sample (x, z, yaw) at most every 400 ms, latest 150 (60 s). When the socket ends, a walk of ≥8 samples and ≥4 m becomes that person's echo in that room: one per person per room, 10 per room, dropped after 48 h. A visitor receives the room's echoes (never their own) once, as `{t:"echoes"}` on connect (≈2.7 KB each at most).
- **Privacy:** only people who are visible in rooms are recorded (guests and invisible members have no socket), and only those people see echoes. Switching to **invisible** calls `POST /api/rooms/forget-echoes`, which removes your echoes from every room and clears what is being recorded. Echoes carry the username, like live presence.
- **Light** (`lib/roomGhosts.ts`): a preallocated pool, no allocation per frame; while an echo walks the room repaints ~15×/s (not 60) and between walks nothing runs; one timer wakes the loop for the next walk. Echoes are drawn as the normal figure at 42 % alpha (`Shown.ghost`, `Shown.note`), are not lockable and do not count in "n here".
- Debug attribute: `data-ghosts` (echoes drawn now).
- Tests: backend `roomghosts.test.ts`, `ghosts.test.ts`, `e2e_fix354.py` (8 checks).

## fix355 — Rooms first, terminal preview

**No schema change.**
- **Rooms first:** every branch link (explorer card, homepage, Study, header chip, radio, chart, channel tether) goes to `/branch/<slug>/room` via `branchHref` (`lib/branchLinks.ts`, `lib/roomFirst.ts`). The explorer card has one **Enter** button. Direct `/branch/:slug` still opens the classic page.
- **Classic via a switch:** the "Classic view" button in the room, and the checkbox "Open branches as 3D rooms" on the branch page. Stored in localStorage `exomusica_rooms3d`; default is on unless classic mode is auto-detected (reduced motion, weak device, save-data).
- **Esc** in a room now goes to the map (`/explore`).
- **Terminal preview:** the chat terminal's screen shows the last 3 messages (24 chars each, "(quiet in here)" when empty), only within 6 m and when the text would be at least 7 px. Refreshed when the terminal closes (`lib/roomPreview.ts`, `RoomWorld.chat`).
- Tests: `preview.test.ts`, `roomfirst.test.ts`, `e2e_fix355.py` (11 checks). Older e2e 340, 347, 297 updated for the new links.

## fix356 — Room editor, part 1: actors and wires

**Schema change:** new table `RoomDoc` (`room_docs`: slug, version, doc JSON). Run the Prisma commands from the delivery note (migration `room_docs`).
- **Idea (from Retro's RUDE):** everything the owner builds in a room is an *Actor*; Actors talk by *wires* (event of one → message to another, optional delay, optional "only once"). No code.
- **Actors:** `solid` (blocks you; box or 3–8 sided prism), `ghost` (cosmetic), `trigger` (zone: sends enter/exit; invisible to visitors), `light` (glow), `marker` (named point). Messages: show / hide / toggle (solid, ghost, light), enable / disable / fire (trigger), fire (marker). Events: shown / hidden, enter / exit, scanned, and `start` (when the room loads).
- **Editor (admin only):** the "Edit room" button in a room opens a panel with a plan view (click to select, drag to move, 0.25 m snap), a list, an inspector (name, X, Z, width, depth, height, turn, shape, colour, starts visible) and a wire builder. New things appear 3 m in front of you. **Test play** runs the room live (triggers, wires, collision); Stop returns to editing. **Save** sends the whole document with the version you loaded; if someone saved in between it says so.
- **Runtime** (`lib/roomDoc.ts`, a copy in `backend/src/lib/roomDoc.ts`, kept identical by a backend test): wires are a flat list; nothing runs per frame unless a trigger exists or a delayed wire is waiting (one timer wakes the room). Guard rails: 150 actors, 400 wires, 8 messages per target per tick, 64 per tick, delays up to 600 s. `cleanDoc` clamps everything and drops dangling wires on both sides.
- **API:** public `GET /api/room-doc/:slug` (cached 30 s), admin `PUT /api/admin/room-doc/:slug {doc, baseVersion}` (409 on conflict), admin `DELETE`.
- **Known limits:** solids are drawn before terminals and people (a person standing behind a solid may be drawn in front of it); collision is at floor level only until the height delivery; no texture painting yet (fix357); actors exist only in the room you are in, not in the far room seen through a corridor.
- Tests: `roomdoc.test.ts` (22), backend `roomdoc.test.ts`, `e2e_fix356.py` (14).

## fix357 — Room editor, part 2: painted floors

**No schema change** (floors live inside the `RoomDoc` document: new fields `tex` and `floor`).
- **Floor tab** in the editor: add up to 16 *materials* per room (pattern, metres per repeat, flow speed, colour), pick one, and paint cells (0.5 m) on the plan view. Tools: **brush** (size 1–5), **fill**, **erase**, **pick up** (take the material under the cursor). **Undo / redo** (buttons, Ctrl+Z, Ctrl+Shift+Z) now cover everything in the editor (things, wires, paint, materials), 50 steps; a drag or a brush stroke counts as one step.
- **Patterns** (generated in the browser, nothing downloaded, always tileable): noise, scan, grid, diamond, circuit, water, brick, static.
- **How it is drawn** (`lib/roomFloor.ts`, `lib/roomTextures.ts`, `RoomPainter.floorPaint`): painted cells are merged into a few rectangles drawn flat first (the average colour), clipped to the room's floor; then 1 m or 0.5 m blocks within 10 m are drawn as affine-mapped tiles from a 128 px sheet. Because each block samples an exact piece of the sheet, the pattern repeats without seams. Budget: 260 tiles per frame, 120 when the resolution governor has dropped a step, none (flat colour only) when it is lower. Flowing floors repaint ~15 times a second; still floors cost nothing.
- **Look:** near tiles show the affine wobble (expected, and the same family as the PS1 look); the floor never leaves the room's walls.
- **Storage:** `floor` is run-length coded over an 80×80 grid centred on the room (covers ±20 m), usually a few hundred bytes. The server clamps and validates it like the rest of the document.
- Fixed on the way: Save stayed disabled after changes that touched only paint or materials.
- Tests: `roomfloor.test.ts` (18), `e2e_fix357.py` (11). Backend copy of `roomDoc.ts` stays identical (backend test).
- **Not yet** (your design notes, queued): wall bands, uploaded textures and sky/.env.zip import, artifacts (text/logo on a wall, scan-only objects, door activation, logbook entries), light pools, fog/grade, particles (dust, black-hole debris), prop catalogue, copy style and subtree themes, conditional swap. Corridors and elevators will become editable rooms.

## fix358 — Room editor, part 3: walls, mood, light pools

**No schema change** (new fields in the room document: `bands`, `grade`, and a `pulse` on actors).
- **Walls tab:** click a wall on the plan (dashed), pick a material (made in the Floor tab), set where along the wall (from % to %) and how high (low m to high m), "Add strip". "Whole wall" fills it. Up to 12 strips per wall, 96 per room. Strips are drawn behind doors.
- **Mood tab:** one colour tint (strength 0 to 0.4) and one fog band across the horizon (colour, density 0 to 1). Drawn as one translucent fill and one cached gradient stamped once per frame.
- **Light pools:** new thing "pool": a soft disc of light on the floor (size, colour), shown/hidden by wires like a light. **Slow swell** (0 to 2 Hz, smooth sine, never a flash) works on pools and lights; this keeps to the strobe rule.
- **Cost:** wall tiles share the floor's tile budget (walls take at most half), only within 12 m, only strips of at most 70 tiles; beyond that, or when the governor has dropped, strips are a flat tint. A room with pulsing or flowing things repaints ~15 times a second; otherwise nothing.
- Tests: `roomstyle.test.ts` (7), `e2e_fix358.py` (11).
- Next: uploaded textures and sky (needs a table), artifacts and the Logbook, particles, corridors as rooms.

## fix359 — Uploaded pictures, ceiling material, zip import

- **Library**: Floor tab → "Add a picture" (any image → centre-cropped square, 128 px, PNG ≤ 100 KB) with a 2×2 seam preview so you can see whether it tiles; "Save to library". "Import a zip" (the `.env.zip` idea) shrinks every picture inside (max 24 per zip, 200 entries, 8 MB each) and adds it. Zip is read with the browser's `DecompressionStream`, no library.
- **Use**: a library picture becomes a material (`kind: "u<id>"`) like any pattern: floor, wall strips, ceiling.
- **Ceiling**: Mood tab → Ceiling select (`RoomDoc.ceil`, 1-based material, 0 none). This is the sky; no panorama skybox yet.
- **Backend**: table `texture_assets` (id, name, png Bytes). Public `GET /api/room-textures/:id` (immutable cache); admin list/POST/DELETE (max 300, body ≤ 300 kB, PNG square 64/128/256).
- **Perf**: uploaded pictures load async and draw flat (average colour) until ready; same per-frame tile budget as built-ins. Editor is a lazy chunk (26 kB), visitors never download it.
- Tests: `roomdoc.test.ts` (27), `zipread.test.ts` (5), backend `png.test.ts`, `e2e_fix359.py` (12).

## fix360 — Skies (`.env.zip` = skybox)

- **Sky replaces the ceiling** as an open view overhead (`RoomDoc.sky = {id, speed}`; wins over the ceiling material). Mood tab → Sky: pick from the library, "Turning" slider −30…30 °/s in 0.5 steps; the panorama wraps round forever, so a starfield can drift.
- **Import**: "Import a skybox zip" or "Add a sky" (select six files at once, or one wide picture). Faces are recognised by name: front/back/left/right/up/down, ft/bk/lf/rt/up/dn, px/nx/py/ny/pz/nz (CamelCase too). At least the four sides are needed (missing top/bottom stay dark). A single wide picture is stretched to 2:1. The editor composes a 1024×512 equirectangular panorama, stored as JPEG (≤ 300 KB; falls back to 512×256).
- **Storage**: same `texture_assets` table, name prefixed `sky:` (no new schema change after fix359). `GET /api/room-textures/:id` now serves PNG or JPEG by signature. Admin POST accepts `{sky:true}`; list returns `sky` flag; sky pictures are hidden from the floor picture grid.
- **Perf**: one clipped `drawImage` (two when wrapping) per frame, only inside the ceiling polygon. A turning sky repaints ~15 Hz only while the ceiling is actually on screen; looking down or a speed of 0 costs nothing.
- Assumptions: up/down faces follow the OpenGL cubemap orientation; sides are unmirrored as seen from inside. Horizontal mapping is linear in angle (slight stretch at the edges on wide screens).
- Tests: `roomdoc.test.ts` (32), `skymake.test.ts` (24), backend `png.test.ts`, `e2e_fix360.py` (15).

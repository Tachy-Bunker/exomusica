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

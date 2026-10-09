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

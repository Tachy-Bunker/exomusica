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
One page, seven tabs: **Overview, Studies, Analyze, Voice lab, Samples, Challenges, Log**. The old addresses `/studies`, `/sample-bank` and `/challenges` redirect into the matching tab; `/lab/voice` still works on its own.
- **Overview** answers "what do I do now?": a *Continue* card for your most recent unfinished study (or "Start something"), a drop zone that sends a sound straight to the Analyzer, then Open now (open challenge, newest samples with inline preview, Voice lab) and the latest studies.
- **Studies** (`components/xenolab/StudiesPanel.tsx`): start from a template (`lib/studyTemplates.ts`: blank, listening notes, experiment, A/B comparison, sound analysis), filter (All / Mine / In progress / Complete), search, preview cards. `GET /api/studies` now returns an `excerpt` (`backend/src/lib/studyExcerpt.ts`).
- **Analyze** (`components/SoundAnalyzer.tsx`): a sound is measured **entirely in the browser; nothing is uploaded**. Decoding (`lib/decodeForAnalysis.ts`) mixes to mono, keeps the first 10 minutes, and decodes files over 12 MB at 22 kHz. Measuring (`lib/soundReport.ts`, run in `workers/soundReport.worker.ts`) is streaming: integrated loudness (LUFS) and range, peak/RMS/crest, clipping, DC offset, silence, pitch (YIN), tempo, rough key, brightness, one-third-octave spectrum, lossy-source cutoff, stereo correlation, waveform, spectrogram. Per-frame work is capped at a fixed number of frames, so a 12-minute 127 MB file takes about 5 s end to end. Results can be copied as notes, downloaded as numbers, saved as a spectrogram PNG, or turned into a study. The Plot tool lives under it.
- **Voice lab** is the existing page embedded (no second title). **Samples** and **Challenges** moved here from Telemetry (`SamplesPanel` in `pages/SampleBankPage.tsx`, `ChallengesPanel` in `pages/ChallengesPage.tsx`); audio samples play on their card and have an *Analyze* button. **Log** lists every entry inline.

## Telemetry (`/telemetry`)
A live overview instead of link tiles. Status line (online, active chats, signals today, members), a **For you** row (your unfinished study, the busiest chat, the open challenge, or the newest member; guests see "Right now"), then panels (Conversations, Members, Messages for members, Contribute, Cult activities) that each show a preview and open **in place** with "Show more". Panels can be pinned (★); pins are kept in localStorage (`lib/telemetryPins.ts`). It refreshes through the same gated poll as Conversations (`livePoll.ts`).

## Tests added (fix276)
`frontend/_scratch/soundReport.test.ts` (DSP against known signals), `telemetryPins.test.ts`, `e2e_xenolab.py` (Playwright with mocked API: 41 checks incl. phone-width overflow), `backend/_scratch/studyExcerpt.test.ts`. Run with `npx tsx`; the e2e needs `npx vite preview --port 4173`.

# Exomusica backlog (kept through chat compaction: update this file with every delivery)

Last updated: website audit delivery (after fix374). **Start with `docs/ROOM_EDITOR_STATE.md`** (architecture, decisions, queue, checklist for the rooms line). Built milestone rewards are listed in `docs/HOMEPAGE_AND_NAV.md`.

## Milestone rewards still labelled "reward being built"
- **Monthly challenge** (100 members): a monthly challenge with a boss brief. Needs a design write-up first (item 91).
- **Twelve Artifacts** (10000 scans): twelve Artifacts revealed, one per twelfth of the way. Needs a design write-up first (item 88).
- **Hull** (24 milestones reached): the seed of the explorable ship, a corridor with one lit door per milestone. Ties to the 3D game below.
- **Emoji gate**: needs a moderation decision from the owner before building.

## Scan map (/explore) and the 3D game
- Connect every room to the rest (today: separate roots are not linked to each other; sealed rooms are linked by dashed spokes). Planned to be solved later by connecting it to the explorable 3D game.
- An explorable, **optimized** 3D sci-fi game inspired by Metroid Prime (the scan map is its seed). Must run on weak devices.
- Optional per-branch position override for the scan map (the admin's old posX/posY hints are unused there).
- Show the scan map on the homepage; the old Soundbay "Explore the map" / `/?map=full` map is still switched off (`lib/features.ts`).
- Pulses from Chart layer ("visited by others this week") are drawn off in the scan map for now (flag in `BranchExplorer.tsx`); the 2D Chart still shows them.
- Touch (pinch / two-finger move) on the scan map is written but only tested with mouse and keyboard.

## Other features
- Spectral wall: community tracks (today official tracks only).
- Commons pack: builds on request; a monthly scheduled build would remove the first-visitor wait.
- Collective jingle: real stem audio would need a per-track opt-in and a mixing job; today it is a motif read from spectral strips.
- Design write-ups only (no build yet): 88 Twelve Artifacts, 91 boss / monthly challenge.
- Index: the "map of how pages connect" part was dropped. Item 56 dropped by the owner.
- ABX listening tests (shelved, definitely wanted).
- Instrument / exomusic maker (live recording and MIDI input may join it); processor module to chain any Airwindows plugin with preview and render; usable-offline desktop and mobile app.
- Realtime bridge bot between the forum and Discord.
- Contributor points system (donation split use undecided).

## Added in fix341 round
- Scan map: connect ALL rooms (no isolated ones) — later, via the 3D game; keep Metroid Prime exploration feel.
- Door: optional per-user door colour/style setting; sound for the door (hiss/clunk) if wanted.
- Scan map: replace `window.location.assign` on Enter with router navigation so the door plays.
- Pulses ("visited by others this week") re-enable via `SHOW_PULSES` in ExplorePage when wanted.

## fix342 notes
- Doors: stronghold (default) and hex (safe unit) both exist; pick via Settings. Door sound still open.

## fix343 notes
- Built: Crate radio, Long wave, X-ray two links, Season shift. Still open from the reward list: Monthly challenge, Signal storm, Offline cache, Twelve Artifacts, Hull, Emoji gate.
- Crate radio ignores community tracks in playlists (official tracks only); add if wanted.
- Season shift: era names and the 52° hue step are guesses; hum is optional and off by default.
- Next planned by the owner: back to the Explore map and how it connects to the 3D game.

## fix344 notes
- Door: access levels no longer change its colour (site primary or branch colour only); bring back as a thin accent if wanted. Door sound still open.

## fix345 notes
- Built: Offline cache (playlists). Still open from the reward list: Monthly challenge, Signal storm, Twelve Artifacts, Hull, Emoji gate.
- Offline: picking single tracks or a whole branch is not built; playlists and albums only.

## fix346 notes
- Built: Signal storm. Still open from the reward list: Monthly challenge, Twelve Artifacts, Hull, Emoji gate.
- **Direction change (owner, after fix346):** the Explore map's "3D game" is no longer a full game. Think of it as a **3D room that replaces a branch's page**, offered for now as an **alternate link** next to the normal branch page. Hull and "connect all rooms" are to be solved inside this idea. Design still to be discussed.
- Signal storm: goal is a constant (1000 new scans in the 48 h after the milestone, `STORM_GOAL`), the Artifact is a spoked figure + nine notes drawn from the most scanned pages; it is the first "Artifact", the Twelve Artifacts design should be consistent with it. Scans have no index on `at` (a once-per-30-seconds count); add `@@index([at])` if the table grows large.

- Built (fix347): walkable 3D branch room as alternate link `/branch/:slug/room`. Solves for now: moving between branches in map layout. Follow-ups: replace branch page with the room (owner decision), connect separate roots (rooms of different roots are not linked on the map, so no doors between them), Hull milestone as a corridor of milestone doors inside the room world, door colour per destination inside the room, sound/footsteps, pedestal album covers as textures, Scan-map Enter should open the room, test on a real phone.

- Built (fix348): people in rooms (live, opt-out, in memory), terminals for albums and chat, arrows look. Follow-ups: member colours and avatars on figures (now hashed from the name), emotes/waves, voice-chat-free "ping", wiki/news/studies/playlists as terminals, per-room guest ghosts, Tab to cycle terminals, door colour per destination, footsteps.

- Built (fix349): the drone = audio player in rooms. Follow-ups: volume and A/B on the drone screen, drone looks per branch/era, drone reacts to the music (level from an analyser), drone visible to other members in the room (position is its owner's, title optional), drone in the normal pages as a corner companion, remove-from-queue and reorder.

## Roadmap after fix349 (owner approved, in this order; bosses based on music/sound are designed AFTER these)
- fix350 DELIVERED: adaptive resolution, allocation-free painter, door prefetch, lock-on (Z / right mouse / Lock button). Next: fix351 Echo visor + Lore logbook, fix352 morph ball, fix353 member echoes, then boss design.
- fix351: Echo visor (ping rings reveal sealed doors / secret branches by sound; unlocked by a milestone) and Lore logbook (scan terminals/walls/doors; completion %, lore authored by owner).
- fix352: Waveform morph ball (roll a ball along a track's waveform; height = amplitude, colour = spectral centroid, bookmarks = save points, position = playback position).
- fix353: Echoes of members (faint replayed paths of recent visitors, asynchronous).
- Then: design write-up of **bosses built on music and sound** (mechanisms), consistent with Monthly challenge and Twelve Artifacts.


## Roadmap after fix351 (corridors)
- fix351 DELIVERED: corridors behind doors matching the map, portal view, two rooms held at a time, door opens on approach and shuts behind you, address follows, presence moves.
- Next: fix352 Echo visor + Lore logbook; fix353 Waveform morph ball; fix354 Echoes of members; then the design write-up of music/sound-based bosses.
- Corridor follow-ups: map shafts as ramps/lifts (floor is flat today), corner sliding feels sticky when pushing dead-straight into an outer corner, people visible in corridors (presence is per room), rooms hum / sound through doors (low-passed bed per room, opens as the door opens), a corridor ambience per link.


## Roadmap after fix352
- fix352 DELIVERED: Echo visor (`m-visor`, 1500 scans, keys V/X/L), Lore logbook, admin "Room lore" page, `LoreEntry` table.
- Next: fix353 Waveform morph ball (needs waveform peak data); fix354 Echoes of members (server-memory path recording); then the design write-up of music/sound-based bosses.
- Follow-ups: logbook synced to the account (today per device), lore for tracks/people scans, spectral walls, rooms hum.


## Roadmap after fix353
- fix353 DELIVERED: Morph ball (overlay from the expanded player; profile shared via `wave_profile` columns).
- Next: fix354 Echoes of members (faint replayed paths of recent visitors; server-memory path recording); then the design write-up of music/sound-based bosses.
- Morph ball follow-ups: also open it from room terminals/the drone, ball hops on transients, ghost balls of other listeners, A/B loop between two save points, make save points from the ball (needs permission model for bookmarks), spectral-flux "gates" as obstacles.

## Roadmap after fix354
- fix354 DELIVERED: Echoes of members (in-memory, per room, 48 h, forget on invisible).
- Next: the design write-up of music/sound-based bosses (consistent with Monthly challenge and Twelve Artifacts).
- Echo follow-ups: persist echoes across restarts (needs a table), echoes in corridors, "echo of the owner" in branches (author walks a tour), echoes that stop at what they scanned, a Morph-ball ghost per listener.

## fix355 notes
- Done: rooms first, terminal preview. Design write-ups written: Room editor, Bosses made of sound (artifacts in claude.ai; recommendation: call-and-response boss first).
- Next: fix356 height (Eye.y, level ramps, platforms, ceilings, jump, look up/down); fix357 admin map overrides (new table MapOverride).
- Editor (E1-E5) waits for the owner's go-ahead after height.

## Vision (owner, fix355 round): THANATON
- Setting: everything inside a supermassive black hole, Thanaton. Members fell in; alien lifeforms and tribes adapted and built the ephemeral rooms. Solo campaign by default (players see each other until they choose a boss/puzzle, which is solo; co-op later). Opens with a scan lore, then the player is dropped into a room.
- Room editor (admin first): low-poly shapes that collide or are cosmetic, damaging or not; textures that loop painted on zones. Exovisual later (psychedelic/entoptic graphics).
- Doc: "Thanaton — 100 possibilities" (claude.ai artifact e3fb55a7-081c-4b81-9a98-482b63b18383). Also "Room editor — design" and "Bosses made of sound — design".
- Order: fix356 height (platform prisms) -> fix357 editor E1-E2 (RoomStyle table, solid/ghost prisms) -> fix358 hazards/triggers -> fix359 admin map overrides. Strobe-safe cap (<3 flashes/s) is a hard rule.

## fix356 notes (editor part 1 done)
- Done: RoomDoc table, actors (solid/ghost/trigger/light/marker), wires, plan-view editor, test play, save with version.
- Next (owner: "editors first", Retro RUDE-inspired): fix357 texture zones painted on floor/walls + prefabs ("assemblies") + more messages (play sound, set colour, teleport, show text). Then paths + camera shots, emitters, hazards (damage/push/slow), then height, then admin map overrides.
- Ideas from the Retro interviews: one universal message system, prefabs, camera shots as first-class, engine owns performance.
- Draw order: solids vs terminals/people are not depth-sorted together; fix when height lands.
- Actors in the far room (seen through a corridor) are not drawn or collided.

## fix357 notes (floor painting done) + owner's edits to the editor design doc
- Answers: no licence/credit field on uploaded textures; zones are NOT scannable; the Logbook fills from rewritten branch descriptions when a room is explored; styles apply per room AND per branch subtree (children inherit unless overridden); corridors/elevators are rooms and must be editable.
- Queue (owner's additions): black-hole debris/frames/ruins props (alien tribes' repairs, things falling through the horizon); artifacts (text, logo, small image; billboard or fixed; scan-visor-only invisible objects; can open doors when scanned; can hold a big Logbook lore entry); sky/ceiling texture swap + import `.env.zip` (compressed on import); ambient dust/fireflies as a small flock (<= ~12, may pass through walls and objects, reappear elsewhere, not drawn out of view, off on weak devices); prop catalogue; copy style; conditional swap (rooms/things appear after contributions, chats, donations...); optional pulsing light pools.
- Next: fix358 = wall bands + uploaded textures + fog/grade + light pools (E2/E3 core); then artifacts + Logbook; then particles; then corridors-as-rooms; then hazards/paths/cameras; then height; then admin map overrides.

## fix358 notes
- Done: wall strips, mood (tint + fog), light pools with slow swell.
- Next: fix359 uploaded textures + sky/ceiling + `.env.zip` import (TextureAsset table; seam preview; compressed on import); then artifacts + Logbook entries from branch descriptions; ambient flock particles; corridors/elevators as editable rooms; subtree themes + copy style; conditional swap; then hazards/paths/cameras; height; admin map overrides.


## Done in fix359
Uploaded textures + seam preview, ceiling material, .env.zip import (as zip of pictures). Not done: panorama skybox (ceiling only).
Queue next: artifacts + Logbook entries, ambient flock, corridors/elevators editable, subtree themes, conditional swap, prop catalogue, debris props, hazards.

## Done in fix360
Skies (replace ceiling, wrap-around turning, skybox zip / six faces / one wide picture). Still open: vertical flow, per-room sky tint, sky on corridors, sky seen through windows (rooms have no windows yet).

## Done in fix361
Artifacts (wall/floor/billboard, visor-only, scannable, Logbook entry, scanned wire). Open: artifact on tall walls auto-aligned to the nearest wall; animated/scrolling text; image panels from branch art; 'rewrite branch description when explored' Logbook.

## Done in fix362
Ambient flock (dust/fireflies, <=12, wall-clipping, view-culled, weak-device off).

## Done in fix363
Corridors editable (things, wires, mood). Open: corridor floor/walls/ceiling/sky/flock; elevators as a real space; layout-shift stability of corridor things.

- fix364 done: subtree themes + copy look. Next: conditional swap, prop catalogue.
- fix365 done: milestone gates on things. Next: prop catalogue + black-hole debris; hazards.
- fix367 done: 12-prop catalogue. Next: hazards (damage/push/slow zones), more props.\n
## fix369 (hazards, messages, height, paths, prefabs, Logbook notes, map overrides, corridor surfaces, first boss)
- Built: see ROOM_EDITOR_STATE.md "fix369 additions". Schema change: `MapOverride` (migrate!).
- Still open: elevators as a real editable space; corridor sky/flock; carry-you-sideways platforms; boss mic input, server contours, peer verification, monthly cycle, other four boss mechanisms (resonance cancellation next); optional older list (Monthly challenge, Twelve Artifacts, Hull, Emoji gate, ABX, instrument maker, processor module, offline app, forum↔Discord bridge, contributor points); vertical sky flow, per-room sky tint, PS1 wobble (owner never answered), scan-on-ping for flock, co-op.

## fix370
- Done: opening lore in Admin, visor HUD, wall dressing.
- Next for the Prime look: per-room dressing density/style in the editor (Surfaces tab), light shafts, bloom on emissive strips, HUD lock reticle/target readout, damage-flash vignette tied to hazards.

## fix371
- Done: per-room dressing density, light shafts, strip bloom, HUD lock readout, damage vignette, Warm industrial preset.
- Open for the look: emissive wall decals (screens/glyph panels from room text), steam/vent particles on vent greebles, per-wall dressing override, HUD scan-in animation when the visor starts.

## fix372
- Done: visor scan-in, screens on heavy dressing (animated, reduced-motion aware).
- Open: vent steam (particles from vent greebles), per-wall dressing override in the Walls tab, dressing preview in the editor (the editor shows the room without greeble today).

## fix373
- Done: player bar expands on top of the room (was hidden under the room page); painter drops its canvas context per frame; room timers cancelled on unmount.
- Open: the lag that grows with time spent walking between rooms (not reproduced here; measure frame cost per hop on a weak device with `?perf`). Also confirm whether "the player that disappears" meant the in-room drone player (it did not disappear in the repro).
- Regression (fix373): 105/107 files pass. `e2e_fix297c` flaked once in the full run (passes alone). `e2e_fix362` fails the reduced-motion repaint check ("0 px, 4-6 frames", limit < 3) both with and without the fix373 room changes, so it predates fix373 and stays open. The room still repaints under reduced motion while the hazard/movement state is active.

## fix374
- Done: one map (the radar); room editor below the button row; channel name once in chat; scan visor as a mode (X), result screen and logbook entry one level deeper (Space, B, X), purple/green outlines of what is in view; icon tiles for the room bar, scan buttons and touch Use (keys on desktop, icon-only on touch), a shorter hint.
- Open: the lag with hops still needs `?perf` numbers from a weak device. Visor canvas is at 1× (saves about 4 MB at DPR 2 with 8 cores; softer lines on high-density screens). Heap totals before and after are not measured. Outlines are not hidden by walls. Scan screen has no sprite for walls, terminals or doors (text only). Touch tiles are icon-only: check on a phone that the icons read without their names.

## Website audit delivery (52 items: security, performance, accessibility/SEO, code health)
Delivered as one delta. Schema change: `User.tokenVersion` (migrate). Re-login once after deploy.

**Security (1-17)**
- Sessions are an httpOnly cookie (`exo_session`, 30 days). The page no longer keeps a token; an old `exomusica_token` is exchanged for the cookie once, at boot, and removed.
- Sign-out and password change end every session of the account (`tokenVersion`). An account snapshot (admin flag, ghost/deleted) refreshes at boot, every 30 s, and per account on login/logout/password change.
- `JWT_SECRET` must be a real value of 32+ characters (the server refuses to start otherwise). Outreach signing no longer falls back to a placeholder.
- Sign-in rate limit: 8 per account and address, 60 per address, in 15 minutes.
- Link previews, the audio proxy, outreach page reads and community track addresses go through `lib/netGuard.ts` (http/https only, ordinary ports, no login in the address, public addresses only, checked at connect time, redirects re-checked).
- WebSockets take the cookie; `?token=` still read for one release and redacted from logs.
- CORS allowlist `CORS_ORIGINS` (default https://exomusica.com). JSON bodies capped at 4 MB; multipart keeps 105 MB.
- Log lines redact `token`, `ticket`, `password`, `key` in the query string. `/health` no longer returns database time.

**Performance (18-29)**
- Routes are lazy (88 page modules), one Suspense boundary. Main bundle 537 kB (169 kB gzip), with Outreach 171 kB and BranchRoom 153 kB outside it.
- Fonts are self-hosted (latin, `public/fonts`), so no request to a font host. Caddy: zstd/gzip for text types, `/assets` immutable for a year, `/dsp` 1 day, `/fonts` 1 week, default no-cache.
- Dial pulse answers are cached for 20 s per member (`routes/dial.ts`).
- Viewport: `dvh` fallbacks for the full-height rules. Dead `.rm-card` CSS removed.
- Already in place, no change: the service worker registers only when an album is pinned; the visor sweep freezes under reduced motion.

**Accessibility / SEO / polish (30-38)**
- Letter shortcuts can be turned off (Account settings, "Keyboard"; `exomusica_letter_shortcuts`).
- Scan screen takes focus on open and returns it on close; a focused scan button takes its own Space/Enter.
- Space-map centre node, online-count toggle and a search result's message take the keyboard.
- Pages without their own title get their section's name (after the page mounts).
- Meta description, Open Graph tags, favicon, font preload.

**Code health and docs (39-52)**
- Structured log lines (`lib/log.ts`) replace the raw `console` calls in the named server modules.
- `scripts/deps-check.sh` prints the audit and outdated packages for both projects.
- Backend `npm audit fix` (non-breaking). Dockerfile runs as `node`; `.dockerignore` for backend and root.
- DEPLOYMENT, ARCHITECTURE (security model), `.env.example`, ROOM_EDITOR_STATE (audit additions) updated.

**Deferred, with reasons**
- Prisma 7 (fixes the remaining Prisma-related high advisories): a breaking CLI/config change; needs a live database run.
- nodemailer 9 to 10 (high advisories on the top-level copy): outreach sends mail through it; needs an SMTP test.
- music-metadata 12, imapflow 2, dotenv 18, TypeScript 7: major versions; each needs its own pass.
- 20 of the 24 flagged click handlers only stop event propagation: nothing to activate from the keyboard, so no change.
- Player seek strip: needs a keyboard design (arrow seek, announced position). Not done.
- Upload magic-byte sniffing: not done.
- Room CSS split: not done (the room block is in `global.css`).
- Public list routes N+1 audit: not done.
- Not run in this sandbox: the backend against a live database, the Caddy and backend Docker builds (no Docker daemon here). Typecheck and build pass.
- Verified here: backend and frontend `tsc --noEmit` pass; frontend `vite build` passes (main 536.69 kB, 168.94 kB gzip); room e2e suite passes; non-room e2e suite passes. Five tests were updated for cookie auth (the `/api/auth/me` stub, and the jam socket asserts no token in the URL). Under parallel load, two tests (fix281, fix283) each showed one race failure; both pass alone and the waits are added.

**Next in the backlog**
- The sound-based boss design is already written (Claude Docs artifact, linked from ROOM_EDITOR_STATE). Not written again.
- Design write-up written: `docs/DESIGN_MILESTONE_REWARDS.md` (Twelve Artifacts, Monthly challenge). Five owner decisions are listed at its end; no build until they are answered.
- `backend/src/seed.ts` logs the default admin password text (`changeme123`) when run. Drop that line before the next seed run.
- Blocked on the owner: editor part 2 (waits for go-ahead after height), emoji gate (moderation decision).


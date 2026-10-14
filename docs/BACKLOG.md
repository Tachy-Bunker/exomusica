# Exomusica backlog (kept through chat compaction: update this file with every delivery)

Last updated: fix344. Built milestone rewards are listed in `docs/HOMEPAGE_AND_NAV.md`.

## Milestone rewards still labelled "reward being built"
- **Monthly challenge** (100 members): a monthly challenge with a boss brief. Needs a design write-up first (item 91).
- **Signal storm** (5000 scans): a 48-hour event where scanning feeds a shared meter; payoff is a surprise Artifact.
- **Offline cache** (1000 tracks): pick what to download for offline listening.
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

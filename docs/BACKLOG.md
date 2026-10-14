# Exomusica backlog (kept through chat compaction: update this file with every delivery)

Last updated: fix341 (delivered). Built milestone rewards are listed in `docs/HOMEPAGE_AND_NAV.md`.

## Milestone rewards still labelled "reward being built"
- **Crate radio** (100 playlists): an always-on station shuffling public playlists, credited by playlist.
- **Long wave** (600 minutes): a 24-hour radio of the whole catalogue with a shared position everyone hears together.
- **Season shift** (180 days): palette and ambient hum change with each era of the site.
- **Monthly challenge** (100 members): a monthly challenge with a boss brief. Needs a design write-up first (item 91).
- **Signal storm** (5000 scans): a 48-hour event where scanning feeds a shared meter; payoff is a surprise Artifact.
- **Offline cache** (1000 tracks): pick what to download for offline listening.
- **Twelve Artifacts** (10000 scans): twelve Artifacts revealed, one per twelfth of the way. Needs a design write-up first (item 88).
- **Hull** (24 milestones reached): the seed of the explorable ship, a corridor with one lit door per milestone. Ties to the 3D game below.
- **X-ray lens, two links away**: the X-ray lens reaching two links out.
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

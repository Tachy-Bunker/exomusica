# Exomusica backlog (kept through chat compaction: update this file with every delivery)

Last updated: fix413 (the Calendar page: the month, week, agenda, discover, places and search views, the quick line and the pasted link in the event form, the password gate; see the Calendar section). Before that: fix411 (trash, P35: deleted rooms, corridors, prefabs, themes and pictures wait 30 days; the admin restores or purges them; sounds join with P3). Calendar backend in fix412 (collaborative calendars: the open and the password-in-link kind, events, pictures, link previews; the page follows). Before that: fix410 (room packages, P1: export a room as `.exoroom`, import a package onto a room with a preview; pictures reused by checksum). Before that: fix409 (map checks, P7: the admin map lists what is wrong and Open selects the room). Before that: fix408 (warp and draft test with milestone states, P8; the doors are rebuilt in place, the draft is never saved). Before that: fix407 (counter and switch actors, P40; the backend room document copy was out of date and is synced again). Before that: fix406 (map links: corridors that join by wall position, gated corridors, lift destination lists; P10, P11 and P12 in part, P22/P26/P27 decided). Before that: the verified Prime roadmap v2 (docs only, after fix405: the RUDE engine list, P1–P40, checked against the source archives). Before that: the lift (fix405): a pad in every room, a cabin that lists the open rooms, a ride to a platform. Before that: the scan visor on the right button, Space never scans; sealed doors gated by a milestone set in admin (fix404). Before that: the Hull as a straight hall with a door per milestone on both side walls (fix403). Before that: the Hull (fix402): a door in the Core, a ring hall, and the milestone cards. Before that: one ambience per page (fix401), inscription links (fix400), the site computer (fix399), one player per page (fix398). Before that: page terminals in the room, the Core card on the homepage, Find in room with the Hidden switch (fix397). Before that: scan key is Enter and Space always jumps, Log export zip, room presence totals on the homepage, branch chat ticker in the room (fix395, fix396). Before that: riding moving platforms (fix394). Before that: jump key and touch Jump, corridor editor at real height (fix393). elevator spiral (fix392). corridor sky and specks (fix391). editor part 2 (fix390: seasons, neon trim, room hum, decals, visitor view, saved versions). **Start with `docs/ROOM_EDITOR_STATE.md`** (architecture, decisions, queue, checklist for the rooms line). Built milestone rewards are listed in `docs/HOMEPAGE_AND_NAV.md`.

## Prime-inspired roadmap (the RUDE engine), v2 from the source code, added after fix405
Sources: the three source archives, read from the code: `metaforce-main` (Metaforce), `PrimeWorldEditor-master` (PWE), `hecl-master` (HECL). Every claim in "What the references are" and "What they nailed" names its file. v1 of this section came from the landing pages and was wrong in places; the corrections are at the end.

### What the references are
- **Metaforce** (`README.md`): a reverse-engineered reimplementation of the Metroid Prime engine, rebuilt on the PrimeDecomp matching decompilation. The README says builds are unavailable while the project stabilises. Use it as a reference, not as a tool to run. Platforms listed: Windows, macOS, Linux (Vulkan), Android, iOS.
- **Prime World Editor** (`README.md`): Qt 6.5+ desktop editor for the Prime series and Donkey Kong Country Returns. The archive does not build alone: `templates/` is an empty submodule.
- **HECL** (`README.md`): a toolkit for asset pipelines. The `DataSpec` format modules that read Prime's game files are not in the archive (`.gitmodules` lists only libSquish, athena, boo and libjpeg-turbo). So HECL's reading of Prime's own formats cannot be checked from these sources, and this plan does not depend on it.

### What the original tools focused on, and the details they nailed
Metaforce (runtime and game logic):
- 69 script object types (`src/MetroidPrime/ScriptObjects`). Twelve are logic: Relay, RandomRelay, MemoryRelay, Timer, Counter, Switch, Dock, DockAreaChange, Trigger, BallTrigger, CameraHintTrigger, DamageableTrigger. Exomusica's wires cover most of this with fewer kinds.
- Timed presentation objects, which make up the cutscenes: ActorKeyframe (timed loop), CameraWaypoint (with field of view), CameraShaker, CameraFilterKeyframe, CameraBlurKeyframe, Midi (a song with a fade time), HUDMemo (a string-table entry shown for a set time).
- 14 tweak classes in `src/MetroidPrime/Tweaks`: Player, PlayerControl, PlayerGun, PlayerRes, Ball, Game, Gui, GuiColors, GunRes, Particle, Targeting, AutoMapper, SlideShow, and the root CTweaks. Balance numbers live in one place.
- A rich-text instruction engine in `src/Kyoto/Text`. A string can carry formatting.
- Precomputed visibility: `CPVSAreaSet` and `CPVSVisOctree` (`include/WorldFormat`). The renderer does not test every object.
- Warp and load: `--warp WORLD,AREA` (with optional memory relays and layer bits) and `--load-save` (memory card slot A), in `src/Metaforce/Runtime.cpp`.
- Original-data checks: `config/<version>/config.yml` names the `object_base` (`orig/<id>`) and the main.dol hash. `sha1/*.sha1` lists the hashes of built files. `orig/` is empty in the archive. It is where the owner places their own game files. The archive ships no game data.

Prime World Editor (`src/Core`, `src/Editor`):
- Project model: packages (named groups), resources (one file each in a virtual tree), a disc folder, and a dependency tree (`CDependencyTree`). Export is a cook step: extract, cook, repack, then build or merge an ISO (`CGameExporter`, `CGameProject`).
- Deleted resources go to a trash path (`CResourceStore`, `DeletedResourcePath`), so a delete can be recovered.
- Undo: about 30 command classes in `src/Editor/Undo` (32 headers, including base interfaces). Covered: create and delete resource and directory, move and rename, clone, paste, add, edit and delete links, property edits, array resize, save store.
- Editors for tweaks (`CTweakEditor`) and strings (`src/Editor/StringEditor`). String tables hold one entry per index, per language (`CStringTable`, `SLanguageData`).
- Logbook categories (`ELogbookCategory`): None, SpacePirateData, ChozoLore, Creatures, Research, Artifacts.
- Script links (`CLink`: state, message, sender, receiver) and layers (`CScriptLayer`: name, active, visible, instances).
- Quickplay (`src/Editor/NDolphinIntegration.cpp`): writes a prebuilt module and a patched copy of main.dol, hooks the loader at a fixed point, and starts Dolphin. A level can be tested without a full ISO build.
- Not present: a timeline or sequence editor. The only "keyframe" hits are resource and particle loader names.

HECL (`blender/hecl`, `driver`, `include/hecl/Blender`):
- Area export with lightmap modes NONE, ORIGINAL and CYCLES (`srea/__init__.py`).
- Adjacent areas link by position: a dock on one area and a dock on the next match when they are within 0.1 m (`swld/__init__.py`, line 28). No hand-made link is needed.
- Reads .blend files without running Blender (`SDNARead.hpp`), and can talk to a running Blender (`Connection.hpp`).
- Cook (`driver/ToolCook.hpp`): a file is skipped when its modification time has not changed since the last cook pass. `-f` forces a rebuild, `--fast` is a fast mode, and cooked data is hashed and cached.
- Shader source compiles to several targets; the sources name Metal, Vulkan/SPIR-V, HLSL, GX and GLSL.

### Exomusica now, against the references
| Area | Reference (from the code) | Exomusica now | Gap (to-do) |
|---|---|---|---|
| Structure | area tree; docks match by position (0.1 m) | branch tree, Explore map, Hull, doors, lifts (fix405) | auto-link by position (P10); map editor links (fix406) |
| Logic | 12 logic kinds: relays, timers, counters, switches, docks | wires: events, messages, delays, once; per-actor milestone gates | counter and switch actors (P40) |
| Layers | layers with name, active and visible flags | per-actor milestone gates | named layers (P13) |
| Timed presentation | keyframes, camera waypoints, shakes, filters, timed music and text | camera shots, delayed wires, text lines | timed presentation actors (P27) |
| Text | string table per language; rich text; HUD text by ID | lore, logbook, terminal pages; no keys, no languages | text table with name keys (P26) |
| Balance | 14 tweak classes in one root | constants in code | tweaks table in admin (P37) |
| Visibility | precomputed visibility per area | one room painted at a time, with budgets | visibility sets only if several rooms are drawn together (P38) |
| Logbook | six categories | logbook with completion per room | categories (P36) |
| Undo and deletes | ~30 undo commands; deletes go to a trash | `cleanDoc` on save; 10 saved versions per room (`ROOM_HISTORY`) | trash (built in fix411); history UI (P9) |
| Test and warp | warp to world and area; load save; quickplay | test play in the editor | warp and draft test (P8) |
| Import and export | cook, repack, ISO | textures and prefabs | room package (P1); prefab library (P2) |
| Models | HECL cook of meshes; Blender reading and live link | 12 fixed props, prisms | model import (P4); Blender route (P5) |
| Sound | Midi with fade time | synth sounds; drone player | track speaker (P22); sound library (P3) |
| Visors | (game) | Combat, Scan, Echo | Thermal (P15); X-ray (P16) |

### Building a complex map with no code (the workflow to aim for)
1. Models: prisms and the catalogue now; GLB import as named parts (P4); a Blender export guide (P5).
2. Pictures and sounds: libraries (textures exist; sounds in P3).
3. Text: a text table keyed by name, with CSV import (P26); logbook categories (P36).
4. Presentation: timed actors on a line now (P27); a timeline view later.
5. Map: rooms, corridors and lifts; doors link by position where they meet (P10, P11).
6. Logic: counters and switches as wire actors (P40).
7. Check and test: validation (P7); draft test without saving (P8).
8. Balance: tweaks in admin, clamped to the device tier (P37, P33).
9. Share and back up: room package (P1, built), prefabs (P2), trash (P35, built), history (P9).

### To-do (S = a day or less, M = a few days, L = a week or more; rough)
Authoring and import/export
- P1 Room package `.exoroom` (zip): room, textures, prefabs and a manifest with a format version. Import runs `cleanDoc`, dedupes textures by SHA-256 (SubtleCrypto), and refuses unknown versions and oversize files. S/M. No schema.
  Built in fix410: `frontend/src/lib/roomPackage.ts` (pure) and `roomPackageNet.ts`; the editor's Mood tab has Export and Import. The import previews first and saves the room as a new version (the old one stays in its history). The library's digests come from `GET /api/admin/room-textures/digests`, so the browser never downloads the library. Limits: the built-in sound names are not in a package (nothing to carry); library sounds come with P3.
- P2 Prefab library: list, search, export and import `.exoprefab`; usable in any branch. S. No schema.
- P3 Sound library: short clips (up to 300 kB, 20 s) like textures; attach to a speaker or a wire `play clip`. Loudness cap. M. Schema: sounds table.
- P4 Model import: GLB or OBJ, low poly (up to 12 parts, 300 triangles). Each part becomes a box or prism in the existing parts format; the model is a prop drawn with the same budget. M/L. No schema. Decided (owner): parts only, the fast option.
- P5 Blender route (the owner models in Blender): a guide and a small script that export GLB with named parts for P4. Do not parse .blend in the browser. HECL's `SDNARead` does that on desktop, and it is too heavy for weak devices. S for the guide, M for a script. Active: the owner models in Blender (decided).
- P6 Editor: multi-select, align and distribute, copy and paste across rooms and branches. S/M.
- P7 Validation panel: rooms with no walk path from the Core (doors and lifts count); sealed rooms with no gate; lifts with no destination; wires to missing actors; text keys missing in a language; actors outside their room; near the caps; doors that look linked but are not. S.
  Built in fix409: `frontend/src/lib/roomCheck.ts` (pure) and a Checks section on the admin map. It lists: rooms with no walk path from the Core (doors, corridors and lift links count); lift and corridor links to rooms that are not on the map; sealed rooms with no gate; gates that are not milestones (rooms, links and actors); wires to missing actors, and wires with an event or message the kind does not have; actors outside their room's walls; rooms near or over the actor and wire caps; walls that meet with no link (a note). Limits: text keys are not checked (P26 builds the text table first); the check reads the stored document, not the cleaned copy, because cleaning drops bad wires without a word; a room with no stored document is not checked for content.
- P8 Warp and draft test: warp to a room from admin. Test a draft in memory with milestone states as they are, all reached, or none reached. Nothing is saved and no version is written. The draft goes through the same `cleanDoc` path. This is Quickplay's idea without the build. S.
  Built in fix408: the room editor's test bar has a milestone select (as is, all reached, none reached); a Warp link on the admin map opens any room in a new tab. Switching the state rebuilds the room's doors and re-reads its gated actors; it re-runs the draft's wires only while testing. The draft is cleaned on every test start, and closing the editor puts the milestones back as they were. Limits: "all" covers the milestones the server lists; the Hull door's own visit state is unchanged by the test.
- P9 History UI: the last 10 saves, what changed, restore one, and restore from the trash (P35). S/M.
- P35 Trash for deleted rooms, prefabs, sounds and textures, kept 30 days, restorable from admin (PWE's `DeletedResourcePath`). S/M. Schema: a deleted-at column or a trash table; decide before writing.
  Built in fix411: `backend/src/lib/trashEntries.ts` (the entry format), `routes/trash.ts` (list, restore, purge; the sweep also drops entries past 30 days), and the delete routes for room documents (rooms, corridors, prefabs, themes: `room-doc`) and pictures (`room-textures`). The admin Trash page (`/admin/trash`) lists them in a second table. A restore puts a room back with its history, and a picture back under its old id; each one refuses with a sentence when the name or id is taken, or the library is full. Sounds are not in the trash: the sound library (P3) does not exist yet. Purge is permanent.
- P36 Logbook categories: lore, research, creatures, artifacts and field notes (PWE's `ELogbookCategory` is the model). A category field on each entry; the Logbook groups by it. S. Check whether the entry needs a schema field first.
- P37 Tweaks table in admin: balance values with defaults (lift ride time, lift radius, walk speed, gate counts, painter budgets per device tier) and per-branch overrides. Clamped to the device tier (P33). Metaforce's 14 tweak classes are the model; one root table, not one per feature. M. Schema: tweaks table.
- P38 Visibility sets: only if a scene draws more than one room at once. Check that first. If it does, precompute which rooms can be seen from each doorway (Metaforce's PVS). M.
- P39 Baked light: precomputed shading per room, saved with the room (HECL's lightmap modes). Only if the painter needs a lit look; measure on a weak device first. L, later.

Level structure
- P10 Map editor (built in fix406, part): stored corridors (`map_links`) join two rooms both ways; the Hull draws them, and each gets doors in the 3D rooms. Auto-link: when two walls meet within 0.1 m, the admin stores the corridor on drop (on by default; decided by the owner: it adds to the mystery and builds up discovery). Walls snap onto each other while dragging. Not yet: drawn shapes, and doors at the exact wall point (a door sits on the wall facing its neighbour, as before). Stored corridors stay when rooms are moved apart: remove them in the panel. M. Schema: `map_links` (fix406).
- P11 Editable lifts (built in fix406, part): a room's lift rows are its cabin's destinations, each with a gate. A room with no lift rows keeps "every open room" (queue item 8). Not yet: a cabin style, and the lift on the Scan map (lift rows show as dashed lines in the admin map only). M. Schema: `map_links`.
- P12 Door colours by gate (built in fix406, part): a corridor behind an unreached gate is red on the Scan map and its door in the room is red and labelled "gated" (sealed rooms stay grey). Not yet: a colour for lift pads and for plain locked doors. S. No schema.
- P13 Named layers: groups of actors (for example "after the show") toggled by a milestone or a wire. S/M.
- P14 Area name card when you enter a branch. S.
- P40 Counter and switch actors (built in fix407): a counter counts the wires that reach it ("count") and sends "reached" once when it has its number (1..99), until "reset". A switch is an invisible on/off that sends "shown"/"hidden". Both are invisible in the room and show in the plan. No schema (room document). Limit: a counter's count is set in the editor only.

Scan, discovery and discussion
- P15 Thermal visor: on the scan visor, rooms and tracks played recently glow (uses the lens in `heat.ts`). M.
- P16 X-ray visor: faint outlines of sealed rooms and hidden artifacts, names still hidden. Outlines reveal that a sealed room exists. Decided: the owner and admins see them; visitors never do. M.
- P17 Artifact threads: each scannable has a thread in the branch chat; the logbook entry links to it. M.
- P18 Field notes: visitors leave a short note on a wall spot; curators approve; approved notes become artifacts credited to the author. Needs a report button and a moderation queue first. M/L. Schema: notes table.
- P19 Credit: lore, survey and field notes show who wrote them. S. Schema: author field if missing.
- P20 Logbook hints: short hints revealed on request, from the text table (P26). S/M.
- P21 Completion percentage per branch on the Explore map, not only in the Logbook. S.

Music in the world
- P22 Track speaker: an actor that plays a track when you come near, or when a wire says so. Decided: any track from the website, or an upload. A fade time, as in Metaforce's Midi object. One player at a time, shared with the drone player. M/L. No schema.
- P23 Scan as a key: a personal gate "tracks scanned at least N" for sealed rooms and lifts. Needs per-member progress (queue item 3). M.
- P24 Multi-phase boss: phases (motif, inverted, faster), each changing lights and doors. M.
- P25 Music-reactive lights: light actors follow a track's loudness, at most two pulses a second (the strobe rule). M.

Cutscenes, text and objectives
- P26 Text table: keyed strings per language, edited in admin, CSV import and export. Keys are names (for example `core.terminal.1`), never numbers (decided). PWE's string tables are index-based, so one inserted line shifts every later text in every language. Names avoid that; P7 flags keys missing in a language. Markup: bold, line break and colour only; no scripts (Metaforce's rich-text engine is far larger than needed). Timed lines take a display time, like HUDMemo. M. Schema: texts table.
- P27 Timed presentation (decided: timed actors first): reframed. Prime's cutscenes are timed objects, not a timeline (PWE has no timeline either). Build first: timed actors (camera shot, camera shake, text line, track, light change) placed on a line, skippable, reduced motion cuts instead of moving. M. A timeline view over the same actors comes later, saved as `seq~<name>`, L. No schema for the first part.
- P28 Objectives: per visitor, in a Missions tab of the logbook: scan N tracks in a branch, visit a room, win a boss, reach a milestone. Text from P26. M. Schema: progress table.
- P29 Save station prop: restores integrity and saves your place (device storage now, account later). S/M. Schema for the account save.

Engine principles (from the references)
- P30 Versioned formats: every saved document (room, prefab, package, text table) has a version and an upgrade step. S.
- P31 Cook cache: textures and prop meshes cached by content hash; a file is re-processed only when its timestamp changes (HECL's cook rule). S/M.
- P32 One source document: the room document stays the single source for the 2D painter and any future renderer. Design rule, no task.
- P33 Device tiers: low, mid and high presets set the painter budgets explicitly. S. Feeds P37.
- P34 Import integrity: packages are checked for size, version and SHA-256 before anything is written. Metaforce's sha1 files only match known builds; they are not a security check. Part of P1.

Not in this plan
- Prime's own game files. Their formats are read by HECL's `DataSpec` modules, which are not in the archive, and the game data belongs to whoever owns the disc. Imports use GLB, OBJ, audio and images the owner made or has rights to.

### Suggested order after fix406 (the owner decides)
1. P10, P11, P12, P40: the map and the logic.
2. P8, P7, P1, P35: test, check, share, undo safety. These multiply everything after them.
3. P26, P27 (timed actors): text and presentation.
4. P22, P23: music in the world.
5. P17, P28, P15, P16, P36: discussion, objectives, visors, logbook categories.
6. P37, P38, P39: only where a weak-device measurement asks for them.
7. P4 and P5 (decided: parts only, Blender). P18 (decided: admins or approved curators) once the moderation queue exists. Done in fix406: P10, P11, P12 (part). Done in fix407: P40. Done in fix408: P8. Done in fix409: P7.
8. Done: P1 (fix410), P35 (fix411). Sounds join the trash when P3 (the sound library) lands, since the library does not exist yet. Calendar (owner request): backend fix412, page fix413; open decisions are in its section.

### Decisions
Answered by the owner:
- P4: parts only (the fast option).
- P5: yes, the owner models in Blender. P5 is active: GLB export with named parts.
- P10: auto-link on by default. Built in fix406.
- P16: the owner and admins see X-ray outlines of sealed rooms; visitors never do.
- P18: admins, or any curator the owner approves (decided). Field notes are moderated by them; the moderation queue is needed first.
- P22: any track from the website, or an upload.
- P26: keys as names, not numbers (as recommended).
- P27: timed actors first, timeline later (as recommended).

### Corrections to v1 (from the code)
- `orig/` in Metaforce is the empty slot for the owner's own game files. The hashes live in `config/` and `sha1/`.
- Metaforce builds are unavailable (README). It is a reference, not a tool to run.
- PWE has about 30 undo command classes, not 44.
- PWE has no timeline or sequence editor. P27 is reframed to match.
- "Archived April 2021" for HECL is not in the archive. Removed.
- "Script property templates from PrimeDecomp" for PWE was not verified. Removed.
- HECL's shader targets are the ones named in the sources (Metal, Vulkan/SPIR-V, HLSL, GX, GLSL).
- The auto-link by position, the trash, the logic actors, the text keys and the tweaks table are new items (P35–P40, P10, P26, P37).

## Owner's round after fix403 (fix404 and the next two rounds)
- **Scan visor on the right button, hint drawn on screen (done, fix404).** Space is jump only. On touch, the Use button is Scan on the visor.
- **Sealed doors name the milestone that opens them (done, fix404).** Admin sets it per hidden branch ("Opens with"); the door shows the milestone with progress. Owner's choice: one milestone per sealed room, not several.
- **Lift (built, fix405).** Always present in each room, a pad to walk onto. Pick any open room, step into a cabin, ride a glowing tube (Metroid Prime 3 style), arrive on a platform with the door to the new branch. Owner's choice: the list holds every open room. Built: the pad, the cabin panel, the 6 s ride, the platform and the far door. Not yet: a cabin you see around you (the panel stands in for it), and the sealed-room question below.
- **Sealed rooms: how they are found (open, owner to decide).** Today a sealed room counts as found only once you have visited its address. The owner's first answer said scanning finds it. Until that is decided, a scan does not reveal a sealed room.
- **Map layout editor (round after).** Admin map edited like the Explore page: add links (corridors, lifts), draw their shapes, and doors follow the room's shape. Needs stored links (a schema change).

## Owner's ideas (fix395–397 round): status and decisions
- **1. The website as a game terminal.** Built, first version (decisions from the owner: all pages can be a terminal; inside it the links stay in this room's branch, XenoLab and the Log). The room's logbook lists the site: this branch's page, XenoLab, the Log. Each opens in a terminal in the room: a same-origin frame (sandboxed, no top navigation) running the terminal's own shell (no header, no menus; the player bar stays). Links are kept to the branch page and its albums, `/xenolab`, `/study/*`, `/wiki`, `/news`. Anything else sends the frame back to the branch page. "Leave ↗" takes you to the whole site, at the page you were on. Rules: `frontend/src/lib/terminal.ts`. Limits: the frame loads the whole site bundle while it is open (weak phones pay for it; it unloads on close); its player is a strip that steers the page's player (fix398). Opens from the logbook and from the site computer in the room (fix399: a prop labelled SITE, on the wall spot furthest from the doors and the Talk terminal; a room with no clear spot has none, and the logbook still lists the site).
- **3. Audio across moves.** Checked by playback (`frontend/_scratch/e2e_fix398.py`, 10/10): a track keeps playing from the album page into the room and with a terminal open. One player per page: a terminal borrows the page's player (`lib/audioStore.ts`), so a track started inside a terminal plays on the same stream, and the terminal shows and steers the track (`TerminalShell.tsx`). Room ambience checked (fix401): one sound at a time with a terminal open, and the terminal's ambience is the page's. Not checked: jingles and clip players inside a terminal.
- **4. Log as a logbook.** Export built: a Log page button and a zip of Markdown plus `Exomusica Log.md`. Built (fix400): an inscription can link a Log page, XenoLab page or news post as `[label](/wiki/slug)`; in the logbook entry the link opens in the room's terminal. Any other `[text](/path)` stays as written. Write it in the lore or in the branch description.
- **5. The homepage keeps its front page; the Core room is a card with a picture.** Built: an "Enter the game" card above the branches, with `frontend/public/img/core-room.jpg`, linking to `/branch/core/room` (or the first central branch with no parent when no `core` branch exists). **The picture is a capture of the room renderer with mock data, not the live Core. Replace the file (same name) with a real screenshot whenever you like.** Built (fix402, shape changed in fix403): the Core has a door to the Hull, dark until the Hull milestone (24) is reached. The Hull is a straight hall with a door per milestone on both side walls (milestones alternate sides); each door is lit once its milestone is reached. The way back to the Core is the door at the hall's near end. Walking into a milestone door, or using it, shows its card.
- **6. Presence as weather.** Built: totals on the homepage (`GET /api/rooms/online`, no names, no rooms). **Find in room** on every profile, shown unless the member is Hidden. Hidden is the room's Visible/Hidden switch, saved to the account while signed in (the last press wins across devices). A hidden member is not found, is not shown to anyone in a room, and is not counted. Find in room names a room only while its branch is public. `GET /api/users/:username/room` is public (no sign-in). Decided by the owner: Find in room stays public.
- **8. The branch chat as radio chatter.** Built: a ticker in the corner of the room.

## Milestone rewards still labelled "reward being built"
- **Hull** (24 milestones reached): built (fix402). The Core's door to it opens at 24; inside, one door per milestone (lit once reached). Its shape is a straight hall with doors on both side walls (see idea 5, fix403). Ties to the 3D game below.
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
- Sound-based bosses (the mechanics in the monthly design): not built. The monthly boss is written by hand and its bar is listening plus room runs.
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
- Editor (E1-E5): done. E3–E5 in fix390 (see ROOM_EDITOR_STATE.md, "fix390 additions").

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
- Room CSS split: not done (the room block is in `global.css`).
- Public list N+1 audit: the channel message list is fixed (see the follow-up below). The other public list routes were checked by a static search only; not verified against a live database.
- Not run in this sandbox: the backend against a live database, the Caddy and backend Docker builds (no Docker daemon here). Typecheck and build pass.
- Verified here: backend and frontend `tsc --noEmit` pass; frontend `vite build` passes (main 536.69 kB, 168.94 kB gzip); room e2e suite passes; non-room e2e suite passes. Five tests were updated for cookie auth (the `/api/auth/me` stub, and the jam socket asserts no token in the URL). Under parallel load, two tests (fix281, fix283) each showed one race failure; both pass alone and the waits are added.

**Next in the backlog**
- The sound-based boss design is already written (Claude Docs artifact, linked from ROOM_EDITOR_STATE). Not written again.
- Design write-up written: `docs/DESIGN_MILESTONE_REWARDS.md` (Twelve Artifacts, Monthly challenge). Five owner decisions are listed at its end; no build until they are answered.
- Blocked on the owner: emoji gate (moderation decision). Editor part 2 is done (fix390).

## Audit follow-up delivery (the four items left open above)
Delta ZIP: `exomusica-audit-followup-delta.zip`. No schema change. No new environment variables.

- **Uploads are checked against their content.** `lib/fileSig.ts` reads the first bytes of each upload and refuses it when they do not match the extension (PNG, JPEG, GIF, WebP, BMP, SVG, MP3, WAV, OGG/Opus, FLAC, AAC, MP4/M4A/MOV, WebM, WOFF, WOFF2, TTF, OTF). Every save path in `lib/storage.ts` calls it before the file is written, so the error reaches the uploader as a 400 with a message. Unknown extensions are not checked, as before.
- **Seed no longer creates a known password.** `seed.ts` used to create `demo_listener` with the password `changeme123` and fall back to it for the admin. Now the admin password is `ADMIN_PASSWORD` if set, otherwise a random one printed once when the admin account is created, and the demo account gets a random password nobody knows (reset it in Admin if you use it). Running the seed on a live database no longer leaves a public login.
- **Message lists resolve track embeds in one query.** Each message containing a track reference used to run its own track query, so a page of 50 embedded messages made up to 50. `toMessageDTOs` (in `lib/messageDto.ts`) fetches all referenced tracks once per list. Embeds keep the order of the references in the text.
- **Player seek strip is a keyboard slider.** It has `role="slider"` with a name, the position as text ("1:02 of 4:56") and tab focus. Left/Right step 5 s, Shift+Left/Right 15 s, Home/End jump to the ends, Up/Down behave like Right/Left. Only the visible strip is in the tab order. The global arrow shortcuts already leave sliders alone, so each key seeks once.

Verified here: backend and frontend `tsc --noEmit` pass; frontend `vite build` passes; `backend/_scratch/fileSig.test.ts` and `trackRefs.test.ts` pass; `frontend/_scratch/e2e_fix376.py` (keyboard seek, 10/10) passes. The player-related e2e files are run as a subset (see the delivery message). Not verified: the batched message list against a live database, and an upload with a wrong signature through the running server.

## Milestone rewards delivery (Twelve Artifacts and the Monthly challenge)
Delta ZIP: `exomusica-milestones-delta.zip`. **Schema change: yes**, three new tables (`artifact_slots`, `monthly_bosses`, `monthly_contributions`) and a new `User` relation. Migration: `backend/prisma/migrations/20261016120000_twelve_artifacts_monthly/migration.sql`. No new environment variables.

- **Twelve Artifacts (`m-artifacts`, live).** Twelve slots, each picked by hand in admin (kind and key of a scannable, title, text, picture, and optionally its own four notes in Hz). Slot k opens at `ceil(k/12 × target)` community scans (833 → 834 … 10000 at the default target). Only open slots show their content on the public page. Each open plate has a Hear button and a text line naming its motif, and Play all plays the open ones in order. Admin: `/admin/artifacts`. Public: `/artifacts`, `GET /api/artifacts`.
- **Monthly challenge (`m-monthly`, live).** The bar is listening minutes to the boss track plus five units per room boss beaten. Each member counts one minute per heartbeat while a signed-in browser plays the boss track (server takes at most one per 50 seconds, so at most 72 an hour). A run counts once per member per UTC day. The first month is the month the milestone was reached. Bosses are written by hand in admin (`/admin/monthly`); the first three months show a temporary brief until one is saved. Public: `/monthly`, `GET /api/monthly`, `GET /api/monthly/mine`.
- The Field Log links to both pages once their milestones are reached.
- Decisions and deviations from the design are in `docs/DESIGN_MILESTONE_REWARDS.md` (section "Built").

Owner to do: write the twelve Artifact texts and choose each slot's item (until then the temporary texts show, and the admin marks them); write the first three monthly briefs and set each boss track by its track number; set goals if the temporary ones are wrong.

Not built: a page for past bosses (the archive is in admin only); links from an Artifact to its scannable; a sound-band boss mechanic; the Artifact motif from the track's spectral centroid (motifs are derived from each key for now).

Verified here: backend `tsc --noEmit` passes; frontend `tsc --noEmit` and `vite build` pass; backend unit tests pass, including the new `artifactsCore.test.ts` and `monthlyCore.test.ts`; `frontend/_scratch/e2e_fix380.py` 29/29; existing milestone, admin nav, boss, and Field Log e2e files pass. The migration SQL was applied to a local Postgres 16 with a minimal `User` table and its statements were run. **Not verified here:** the Prisma client calls against a real database (the Prisma engine download is blocked in this sandbox), so run the site once after deploying and open `/artifacts`, `/monthly`, `/admin/artifacts` and `/admin/monthly`.

## Calendar (owner request, 2026-10-19)
- Collaborative calendars, like Outreach: several calendars. An open calendar needs no password. A protected one is opened by its link with the password after `#` (the page sends it once and keeps a token for that calendar, valid 30 days or until the password changes). Events carry a title, text, link, place, start and end (with a zone), and a preview picture. Guests add, change and remove events on any calendar they can open; the admin does everything and is the only one who makes calendars, sets a password on an open one, or deletes a calendar.
- Built in fix412 (backend; access, members and the picture cap in fix413): `backend/src/routes/calendars.ts`, `lib/calendarRules.ts` (every check, pure), `lib/calendarScope.ts` (tokens, limits), `lib/linkPreview.ts` (reads a page's title, text, site and picture). Models `Calendar`, `CalendarEvent`, `CalendarImage`; migration `20261019130000_calendars`. Pages and pictures a guest pastes are fetched only through `lib/netGuard.ts` (`safeGet`, `readBody`), with the same address checks as the audio proxy.
- Built in fix413 (frontend, with the access rules above): `/calendar` lists the open calendars (and makes one for the admin); `/calendar/<slug>` opens a calendar, and a protected one takes its password from `#<password>` (the address bar is then cleaned, the token is kept), or from the gate. Views: month, week, agenda, discover (the coming events as cards, shuffled on request), places (one place at a time), search. Filters: place, with a picture, and the search box. The event form takes a line such as "Vernissage at Le Trianon, 2 Nov 20:00" (or "X à Y", with the day and time in French or English, "demain", "lundi", 24h or am/pm) and a pasted link (its title, text and picture come from the page). Files: `lib/calendarQuickAdd.ts` (the parser, pure), `lib/calendarTime.ts` (days and zones, Monday first), `lib/calendarFilter.ts`, `lib/calendarApi.ts` (the calls and the per-calendar token), `components/calendar/*`, `pages/CalendarPage.tsx`, `pages/CalendarIndexPage.tsx`. No schema change.
- Decided by the owner (2026-10-19), built in fix413:
  - Languages: English by default; `?fr` in the link, or the button on the page, shows French (the link keeps it; `?fr` is also on the links the page makes). Dates follow the language. Server sentences are translated where they are known (`frontend/src/lib/calendarI18n.tsx`; an unknown sentence stays English).
  - Who may change events, set by the creator (the signed-in account that made it) or the admin, per calendar: `guests` (anyone who can open it, the default) or `members` (only the creator, the admin and the listed site accounts; members open a protected calendar without its password, and a guest with the password can read but not change). Only the admin changes the picture limit.
  - Pictures: 200 per calendar by default (`pictureCap`, admin only, 1 to 2000). Past the cap the picture of the oldest event goes (the event keeps its text); a picture no event uses goes first. Lowering the cap removes the oldest at once. Uploads and link pictures both count; the page says when one was removed.
  - Schema: `Calendar.editMode`, `members`, `pictureCap`, `createdBy`; migration `20261019140000_calendar_access`.
- Still open: the calendar is not linked from the site's menu yet; it is reached by its address (decide where the link goes). Any guest with the password can still rename the calendar and change any event (only members are limited in `members` mode).

# Rooms, editor and Thanaton — state of the build (read this first after a chat compaction)

Owner: Tachy (designer; no programming knowledge). Last updated: fix367. Update this file with every delivery, together with `docs/BACKLOG.md` (queue) and `docs/HOMEPAGE_AND_NAV.md` (per-fix notes).

## Owner preferences (standing)
- Direct tone, no flattery, rare/on-point ideas. Maximum convenience for the designer (everything via editor UI, no code). Optimised code that runs on weak devices (allocation-free painters, budgets, adaptive resolution).
- When a delivery changes the Prisma schema the final report MUST give the full commands and say to answer "no" to any reset prompt:
  `docker compose run --rm -v "$(pwd)/backend/prisma:/app/prisma" backend npx prisma migrate dev --name <name>` / `docker compose run --rm backend npx prisma generate` / `docker compose up -d --build`.
- Zip each delivery (`exomusica-fixNNN.zip`, excluding node_modules, dist, .git, _scratch). Mention "unzipping doesn't delete removed files" when files were removed.
- Strobe-safe: smooth swells only, 0–2 Hz, never flashes. Respect `prefers-reduced-motion`.

## Vision
Everything is inside a supermassive black hole, **Thanaton**. Members fell in; alien tribes/lifeforms adapted and built the ephemeral rooms. Solo campaign by default (players see each other until they pick a boss/puzzle, which is solo; co-op later). Opens with a scan lore, then you are dropped in a room. Room editor = low-poly shapes (collide or not, damage or not), looping textures; Exovisual (psychedelic/entoptic) later. Inspiration: Retro RUDE interviews — no-code, designer-first, any object sends any message to any object.

## Owner decisions on the editor
- No licence/credit field on uploaded textures. Zones are not scannable. Logbook fills from branch descriptions rewritten when a room is explored (NOT built yet).
- Styles apply per room AND per branch subtree (children inherit unless overridden) (built as fix364). Corridors and elevators count as rooms and must be editable (NOT built yet).
- `.env.zip` = **skybox files** (built as fix360). Sky may rotate/animate with wrapping (built).
- PS1-style affine wobble question: unanswered.

## Architecture
- Frontend `/home/claude/exomusica/frontend` (React 19 + Vite + TS), backend `backend/` (Fastify + Prisma + Postgres), Docker on the owner's VPS.
- 3D room = 2D-canvas painter's-algorithm renderer: `lib/roomPaint.ts` (`RoomPainter`, allocation-free, `ScaleGovernor`), frame loop in `components/BranchRoom.tsx` (`dirty`/`wake`/`more`; repaint ~15 Hz when `scrolling`). Module-level `actorLayer` in roomPaint carries `{slug, doc, rt, edit, sel, floor, budget, now, anim, skyAnim, skySeen, visor, flockAnim, flockSeen}`. Tile budget: 260 (120 if gov.scale<1, 0 below 0.75; 0 also switches the flock off).
- Rooms-first navigation (`lib/roomFirst.ts`, `branchHref`), classic switch. Room world: `lib/roomWorld.ts`, `roomScene.ts` (`inRoom`), `roomView.ts` (eye, `EYE_Y=1.6`, positive pitch = look up; right axis = (-sin yaw, cos yaw)).
- **Room document** (`lib/roomDoc.ts`, backend copy `backend/src/lib/roomDoc.ts` MUST stay byte-identical; a backend test compares them; always `cp` after editing): `RoomDoc {v, version, actors[], wires[], tex[], floor(RLE 80×80 cells of 0.5 m), bands[], grade, ceil, sky, flock, inherit}`; `cleanDoc` validates everything. Caps: 150 actors, 400 wires, 16 materials, 96 wall bands (12/wall), 8 msgs/target/tick, 64/tick, delay ≤ 600 s, doc ≤ 200 kB server-side.
- Actors: `solid` (collides), `ghost`, `trigger` (enter/exit), `light`, `pool` (floor glow, pulse), `marker` (named invisible point), `artifact` (panel). Fields: id,kind,name,x,z,w,d,h,rot,sides,color,on,pulse + artifact-only `text(≤60), lore(≤1500), img(library id), mode(0 wall/1 floor/2 billboard), visor`.
- Wires: `{from, ev, to, msg, delay, once}`; events per kind in `EVENTS` ("start" last), messages in `MESSAGES` (show/hide/toggle/enable/disable/fire). `WireRuntime` (probe/tick/emit/drain).
- Textures: procedural kinds (noise, scan, grid, diamond, circuit, water, brick, static) + library pictures `u<id>` (128 px squares, ≤100 KB PNG; sheets 256 px = 2×2 repeats). Affine tiles under `ctx.setTransform`. Flat average colour first, then textured tiles within 10–12 m under budget.
- **Library** = table `texture_assets` (id, name, png Bytes). Names prefixed `sky:` are skies (JPEG/PNG 2:1, 512/1024/2048 wide, ≤300 kB, composed in-browser from six faces or one wide picture; `lib/skyMake.ts`). Routes `backend/src/routes/roomTextures.ts`: public `GET /api/room-textures/:id` (PNG or JPEG by signature, immutable cache); admin list/POST/DELETE (max 300). `lib/png.ts` validators. Zip import uses `DecompressionStream("deflate-raw")` (`lib/zipRead.ts`).
- Sky: replaces the ceiling as an open view (equirect sampled by yaw/pitch, wraps; `speed` −30…30 °/s). Repaints 15 Hz only while the ceiling is on screen.
- Flock: ≤12 specks (dust/fireflies), drift through walls, fade/respawn elsewhere, only drawn in view, off on weak devices / reduced motion.
- Artifacts: scan address `room:<slug>/artifact/<id>`; lock-on via `artifactLocks` in `lib/roomLock.ts`; `scannables(W, arts)` in `lib/roomLore.ts`; scanning emits `scanned` (re-emitted on re-entry for already-scanned ones); visor-only hidden unless visor unlocked. Logbook = `components/RoomTerminal.tsx`.
- Editor `components/RoomEditor.tsx` (lazy chunk): tabs Things, Floor, Walls, Mood. Plan canvas (click/drag/brush), inspector, wires builder, undo/redo (Ctrl+Z), test play, save (PUT with `baseVersion`, 409 on conflict)/revert. Mood tab: fog, tint, flock, sky, ceiling. Floor tab: materials, tools, picture library (upload with 2×2 seam preview, zip import).
- Corridors: doc key `low~high` (`lib/roomCorr.ts`), frame of the lower-slug room, `corrLayer` in roomPaint, `BranchRoom` `useCorr/syncCorr/editCorridor`; plan in the editor via `corridorWorld`.
- Backend routes: `GET /api/room-doc/:slug` (public), `PUT /api/admin/room-doc/:slug`, `DELETE`. Schema models: `RoomDoc` (`room_docs`), `TextureAsset` (`texture_assets`).
- Shared GET cache `lib/sharedGet.ts` (`clearShared` after saves). `lib/heat.ts` `pathOfHref` strips `/branch/<slug>/room`.

## Delivered (rooms line)
fix347 rooms · 348 people/terminals · 349 drone/player · 352 scan/visor/Logbook · 355 rooms-first · 356 actors+wires editor · 357 floor textures · 358 walls/mood/pools · 359 library pictures, ceiling, zip · 360 skies · 361 artifacts · 362 ambient flock · 363 editable corridors · 364 subtree themes + copy look · 365 milestone gates (conditional swap) · 366 layout fixes (chat dock beside rooms/map, no joystick on desktop, phone map/room buttons) · 367 prop catalogue.

## Queue (priority order, from the owner's additions)
1. (corridors DONE in fix363: own doc `low~high`, things + mood only) Remaining: corridor floor/walls/ceiling/sky/flock, and elevators (not a space in the room view yet: needs the elevator space first).
2. (DONE fix364) Subtree themes and copy look. Possible extension: themes for materials/floor.
3. (things DONE fix365) Conditional swap by community milestone. Not built: gating whole rooms/doors, per-member conditions (your own contributions), donations (no milestone metric for them yet).
4. (first catalogue DONE fix367: 12 props) More props, e.g. tribe repairs, signage, cables, props that react to wires.
5. Hazards: damage, push, slow zones (never-hard-fail health model).
6. Logbook entries rewritten from branch descriptions when a room is explored.
7. Paths and camera shots, prefabs, more wire messages (play sound, set colour, teleport, show text).
8. Height: `Eye.y`, ramps, platforms, ceilings, jump, look up/down.
9. Admin map overrides (needs a new table).
10. Opening scan lore + first boss ("bosses made of sound", call and response).
11. Optional: vertical sky flow, per-room sky tint, sky in corridors, PS1 wobble (if the owner wants it), scan-on-ping for flock, pulsing light pools beyond pools (done), co-op.
Older list: see `docs/BACKLOG.md` (Monthly challenge, Twelve Artifacts, Hull, Emoji gate, ABX, instrument maker, processor module, offline app, forum↔Discord bridge, contributor points).

- **Themes** (fix364, `lib/roomTheme.ts`): doc key `theme~<slug>` in the same `room_docs` table holds only grade/sky/flock. A room's effective look = own non-null field, else nearest theme in `lineageOf(chart, slug)` (self, parent, grandparent…) when `doc.inherit` (default true). `actorLayer.look` carries the result; editor Mood tab has inherit checkbox, save/remove theme, copy/paste look (localStorage `exomusica_look`). Editor sliders show the room's own values, not inherited ones. A branch literally named "theme" is fine (key prefix is `theme~`).

- **Gates** (fix365): every actor has `gate` (milestone key from `/api/milestones`, "" = always) and `gateOff` (reverse: there only until reached). `WireRuntime(doc, reached)` shuts gated-out actors (`rt.shut`: off, never enabled, ignore messages, emit nothing). Unknown milestones = not reached. BranchRoom waits for `loadMilestones()` before applying a room doc; milestone state is fixed for the life of the component (reload to refresh). The editor always shows everything (painter draws all in edit mode); test play respects gates. Swap = one thing "there once X", another "there until X". Milestones are community-wide, so everyone sees the same room.

- **Props** (fix367): Actor field `prop` (solid/ghost only). Catalogue = `lib/roomProps.ts` (`PROP_DEFS`: parts = [x, z, w, d, y0, h, sides, turn] as fractions of the actor's w/d/h; ≤8 parts) + `PROP_BLOCKS` in roomDoc.ts (id → blocks you; frames, arches, ribs, scaffold, drifter are walk-through, collision skips them). Painter `propDraw` sorts parts far→near and reuses `prism(..., style, y0)`; `drifter` bobs ±0.12 m at ~0.2 Hz (off with reduced motion). Editor: "+ prop…" menu and a Prop select in the inspector (choosing a prop loads its default size; props have no shape picker). Adding a prop id means editing both roomProps.ts and PROP_BLOCKS.

## Design docs (Claude Docs artifacts)
- Room editor — design: https://claude.ai/code/artifact/b6e0382b-19d7-404e-8d6e-c6a7dc668097 (owner-edited; has Wiring section)
- Bosses made of sound — design: https://claude.ai/code/artifact/7310628e-06b7-4510-8893-53aefa6cfea0
- Thanaton — 100 possibilities: https://claude.ai/code/artifact/e3fb55a7-081c-4b81-9a98-482b63b18383

## Test and delivery checklist (every fix)
1. `npx tsc --noEmit` and `npx vite build` in `frontend/` (backend tsc has pre-existing Prisma type errors; ignore).
2. Unit tests (`npx tsx _scratch/<name>.test.ts`): `roomdoc`, `roomfloor`, `roomstyle`, `zipread`, `skymake`, `roomcorr`; backend `_scratch/roomdoc.test.ts`, `png.test.ts`.
3. New `_scratch/e2e_fixNNN.py` (copy the header of the latest one; it execs `e2e_fix277.py`'s prelude; mocks `/api/room-doc`, `/api/admin/room-textures`, `/api/milestones`, `/api/scans`). Needs `npx vite preview --port 4173` running on `dist` (start with `setsid nohup`; it dies if the shell session is recycled).
4. Full regression in the background: `ls _scratch/e2e_fix*.py | sed 's/.*fix//;s/\.py//' | grep -v '^NNN$' | sort -n` → run each with `timeout 280`, log to `/tmp/regNNN.txt`; do not rebuild dist while it runs. Known flakes (pass on rerun): 291, 312, 347, 356, 353's `ERR_TUNNEL_CONNECTION_FAILED` console noise.
5. Append a section to `docs/HOMEPAGE_AND_NAV.md`, update this file and `docs/BACKLOG.md`.
6. Zip from `/home/claude` and send with SendUserFile; final report: what it does, limits, schema commands if any, next in queue.

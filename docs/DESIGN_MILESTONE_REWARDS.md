# Design: Twelve Artifacts (10 000 scans) and Monthly challenge (100 members)

Status: built (2026-10-16), with the owner's decisions applied. Both milestones are `live: true` in `backend/src/lib/milestonesCore.ts`.
The owner's answers are at the end, and the "Built" section lists where the build differs from this proposal.
The boss mechanics referred to here are in the sound-boss design (linked from `ROOM_EDITOR_STATE.md`); this document does
not restate them.

## 1. Twelve Artifacts (`m-artifacts`, 10 000 scans)

**The idea.** Twelve objects sit in the sealed core of the map. The community opens them one by one, each one when the
scan count passes another twelfth of the target. Each Artifact is a thing that was scanned, not something we invent:
it is a real scannable (a room, a track, a wiki page, a person's logbook entry) that the community's own scans chose.

**Rule (simple, testable).**
- Artifact `k` (k = 1..12) is revealed when the community scan count reaches `k/12 × target`. With the default target
  that is every 833 scans. `reachedAt` is stored per artifact, the same way milestones store theirs.
- Which thing becomes Artifact `k`: the most-scanned item that has never been an Artifact and is not on the map as a
  sealed branch. Ties go to the older item. The choice is made once, at reveal time, and stored, so it never changes.
- An admin can override any slot (a fixed item, or "leave it to the scans"). This keeps the owner's authorship.

**Why it is different from Signal storm (`m-storm`).** The storm is a 48-hour event that forms one Artifact from the
week's scans. The twelve are permanent, one per twelfth, and the order is the story. Do not merge the two.

**What the player gets.** Each Artifact is a scannable with a lore entry (the owner writes the twelve texts) and a
picture. Once revealed it lives in the Logbook as a plate. Twelve plates complete the Logbook page for the milestone.
It is a collection, not a power-up: nothing about play changes, so nobody is pushed to scan for a perk.

**Rare option, recommended as the first build.** Each Artifact also carries a *sound*: a four-second motif made from the
spectral centroid of the item's track (or, for non-track items, a fixed motif the owner picks). Hearing all twelve in
order plays a 48-second sequence that the Collective jingle can quote later. Cheap to build (the motif code exists in
`lib/motif.ts`), no per-frame cost, and it gives the milestone a reason to be heard, not just looked at.

**Performance and weak devices.** Reveal state is a row per artifact plus a cached list (60 s, like the milestone list).
The client gets twelve small records. No new render loop. Motifs are synthesised on demand with triangle oscillators,
the way the jingle already is.

**Accessibility.** No flashes on reveal; the plate fades in over 600 ms, and the fade is instant under reduced motion.
The motif always has a text line beside it.

## 2. Monthly challenge (`m-monthly`, 100 members)

**The idea.** From the milestone onward, one challenge opens per calendar month. Each challenge is a boss brief: one boss,
one rule, one sound. A month is a single fight; the next month is a different boss. The site stays solo by default, as the
Thanaton vision says: members fight alone, and the monthly boss shows the month's shared progress.

**Rule (proposed).**
- The brief is written by the owner (or picked from a list of ready bosses) and goes live on the 1st, 00:00 UTC.
- Shared progress is the community's listening to the boss's track: minutes played of that track, all members together,
  filling a bar. When the bar is full, the boss is down for everyone and the brief archives with the date.
- Each member also has a personal attempt: one run per day in the 3D rooms, with the boss's rule. The personal run
  does not count toward the bar, so a quiet member is not penalised.
- The month always ends: if the bar is not full on the last day, the boss stays open in the archive as "still standing",
  never as a failure with a penalty.

**Rare option, recommended.** The boss is made of its track. Its "health" is the track's own spectrum: the bar is
divided into the track's bands, and listening fills the bands the boss is weakest in (the sound-boss mechanics say which).
Members who only listen contribute, members who play the room contribute more, and nobody is forced to do either.

**Gaming and trade-offs.**
- Minutes can be gamed by looping one track. Count a minute only when the player is in a tab with audible output and
  the position moves; count each member's contribution per track at most once per hour toward the bar.
- A monthly rule that only the owner can write becomes a bottleneck. Keep a list of ready bosses so a month never
  waits on writing.

**Performance and weak devices.** The bar is a single number per month, computed by the server from the existing
play-count rows, cached 30 s. No per-frame work. The personal run is the existing 3D room, so it adds nothing new to load.

**Accessibility and strobe rule.** Any flash in a boss fight stays under three per second. The rule is a hard limit in
the boss brief checker, not a hope.

## Owner decisions needed (in order)

1. Twelve Artifacts: is the reveal rule (k/12 of the target, most-scanned never-an-artifact) right, or do you want the
   owner to pick all twelve by hand?
2. Twelve Artifacts: is the sound per artifact in scope for the first build? (Recommended: yes.)
3. Monthly challenge: shared bar fed by listening minutes (recommended), or by room runs, or by both?
4. Monthly challenge: write each boss by hand, or keep a list of ready bosses that rotate?
5. Who writes the twelve Artifact texts and the first three monthly briefs?

## Owner decisions: answered (2026-10-16)
1. Twelve Artifacts: the owner picks all twelve by hand. The automatic pick is not used.
2. Sound per Artifact: yes.
3. Monthly bar: both listening minutes and room runs.
4. Bosses: written by hand. A ready-boss list is not built.
5. Temporary texts for the twelve Artifacts and the first three monthly briefs, to be edited by the owner. They are live now, and the admin marks each slot whose text is temporary.

## Built
- **Artifacts.** Slot k opens at `ceil(k/12 × target)` scans. Reveals are sticky the way milestones are: a raised target clears the reveal. Each slot has kind and key, title, text, picture, and optional notes; an empty slot uses the temporary text. Motifs are four notes derived from the slot's key on the server (`motifFromSeed`), and the owner can override them.
- **Monthly challenge.** Listening: one unit (one minute) per heartbeat sent by a signed-in member while the boss track plays, at most one per 50 seconds. Room run: five units, once per member per UTC day, when a room boss is beaten (`BranchRoom` onWin). The bar is the sum of both. A brief is written per month; the first three months of the challenge fall back to temporary briefs; a month with neither shows "no brief yet". `downAt` is kept in step with the bar.

## Where the build differs from the proposal
- Room runs count toward the bar (decision 3). The proposal kept them outside it.
- Each member's "personal attempt" is the room boss win, not a separate daily run mode. The 3D room is unchanged.
- No sound-band mechanic: the bar is one number, not split into the boss track's bands.
- Motifs come from the key hash, not the spectral centroid. The centroid is deferred.
- Timing: a plate's motif is about 2.3 s (four notes, 0.35 s apart), and Play all runs about 33 s. The proposal said four seconds and 48 seconds.
- The reveal thresholds are the twelfths the proposal gave (834, 1667, 2500, and so on at the default target).
- The first challenge month is the month the milestone was reached, so the challenge is open at once.

## Still open
- The owner writes the twelve texts and picks the twelve items; the temporary texts stay visible until then.
- The owner writes the first three briefs and sets each boss track by its track number. Until a track is set, only room runs count that month.
- Past bosses have no public archive page yet (admin shows the archive).
- Artifacts do not link to their scannable yet.

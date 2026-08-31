# Using Exomusica — admin walkthrough

Log in, then everything below lives under **Admin** in the top nav (only
visible to admin accounts).

## Approving members

**Admin → Join requests** shows everyone waiting. Each card has their bio
and their stated reason for joining. Approve creates their real account
immediately (they can log in right away with the password they set);
reject just discards the request — neither notifies them by email yet,
since that's still a manual "tell them yourself" step.

## Creating a branch (a node on the homepage tree)

**Admin → Branches** → fill in slug (used in URLs, e.g. `ambient-drift`),
name, description, optional cover art URL, and optional parent branch (for
sub-branches, if you want the tree to nest). Creating a branch **also
creates its forum topic automatically** — you don't do that as a separate
step. It shows up on the homepage tree right away, positioned
automatically unless you've set explicit coordinates on it.

## Creating an album (a branch's Music page content)

**Admin → Albums**:
1. Pick which branch it belongs to from the dropdown at the top.
2. Fill in the "New album" form (slug, title, composer, description) and
   submit.
3. Once it exists, use "Add track" below to add one or more tracks —
   title, a direct file URL (needs to actually be hosted somewhere; this
   doesn't upload audio files for you, see the note below), and format.
4. "Add collaborator to album" — pick an existing collaborator from the
   dropdown, or switch to "New" to create one on the spot and link them in
   the same step.

**About audio file hosting**: the "file URL" field just needs to point at
a real, publicly reachable audio file — this doesn't host or transcode
audio itself. Options: upload to the VPS's `uploads/` volume yourself and
reference it as `/uploads/<whatever>/<file>` (same static-serving path the
emoji images use), or link to something already hosted elsewhere
(archive.org, your own CDN). There's no admin upload button for tracks
yet — file URL only.

## Creating a wiki page

**Admin → Wiki** → slug, title, optional parent page (for nesting), and
the content itself in plain markdown: `# Heading`, `**bold**`, `*italic*`,
`[link](https://...)`, and `- bullet` lines. Not the same syntax as forum
messages — this is a smaller, plainer renderer, no spoilers/mentions/etc.

## Writing a blog post

**Admin → Blog** → slug, title, markdown content, "Publish immediately" if
you want it live right away (otherwise it saves as a draft you can publish
later from the list). Once published, a **Notify subscribers** button
appears next to it — that's a separate, deliberate action, not automatic;
publishing and emailing your list are two different decisions.

## Creating a Discussion topic

**Admin → Discussion topics** → slug and name. These are the free-standing
forum topics not tied to any branch (Art You Like, Science, Primal Taste
Theory, or whatever else you want). They work exactly like branch topics —
live chat, day archives, search — just without a branch or music page
attached.

## Uploading emoji

**Admin → Emoji** → select one or several PNG/BMP files at once (multi-select
in the file picker is how you do a full palette import in one go) → Upload.
The filename becomes the `:name:` — if that name's taken, a number gets
appended automatically. Once uploaded, anyone can use them by typing `:` in
the message composer, which shows a live filtered picker.

## Moderating

**Admin → Users** — search by (partial) username. "Ghost" on an account
disables login and clears its email/bio, but leaves every message they
ever posted exactly where it is, attributed to them. This can't be undone
from the UI (it's a one-way action by design — matches what you asked for
around account deletion).

Message-level moderation doesn't have its own admin page — it happens
inline, in the forum itself: any admin sees a **delete** button on every
message (members only see it on their own). Deleted messages stay in
place as a "message deleted" placeholder rather than disappearing, so
reply-threads and search results don't leave holes.

## What doesn't have an admin UI yet

- Editing an existing album/wiki page/blog post after creation (the update
  endpoints exist — `PATCH` routes — there's just no edit form wired up in
  the admin panel, only creation)
- **Branches specifically have no update endpoint at all yet** — not just
  a missing form. Renaming one or changing its description means a direct
  database edit for now, not a small frontend follow-up like the others.
- Reordering tracks within an album
- The homepage tree's node positions (`posX`/`posY`) — currently only
  settable by editing the database directly; the auto-layout is fine for
  most cases

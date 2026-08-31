# Deploying Exomusica

## The short answer to your two questions

**Do you compile anything on Windows?** No. `docker compose up --build` compiles the
backend TypeScript, generates the Prisma client, and runs the frontend's Vite
production build — all inside Linux containers, on the VPS, when you run that
command there. Windows never touches a compiler. It only needs a way to get
the code onto the VPS.

**Do you use the server's file manager?** Don't. Use git. A file manager
upload will happily include `node_modules` (hundreds of MB, and it gets
rebuilt inside Docker anyway), gives you no history, and turns every future
change into "re-upload everything and hope." Git gives you a two-command
redeploy (`git pull && docker compose up -d --build`) and a rollback if
something breaks.

## Hostinger specifics

Everything below is generic Docker/VPS steps, but two things are worth
knowing up front since you're on Hostinger:

- **No SSH client needed at all, if you don't want one.** hPanel → VPS →
  Manage → **Terminal** (top right) opens a browser terminal, already
  authenticated, no PuTTY or Windows OpenSSH required. Every command below
  can be typed there directly. (A real SSH client still works if you prefer
  it — hPanel's VPS Overview page shows the IP and SSH username under "VPS
  details" for that.)
- **Pick the Docker OS template when you create/reinstall the VPS**, if it's
  not already running one — it comes with Docker preinstalled, skipping
  step 3 below entirely. If you're not sure what's currently installed,
  just run the `docker --version` check at the start of step 3; if it
  fails, install it with the one command there.
- Hostinger also has a **Docker Manager** GUI (hPanel → VPS → Manage →
  Docker Manager) with logs, start/stop, and a "Compose" button that can
  deploy straight from a GitHub URL. It's a genuinely nice way to *monitor*
  things once running. For the actual first deploy, use the terminal steps
  below instead — they're the ones I've actually reasoned through
  end-to-end (the one-off Prisma migration step in particular needs a bind
  mount the GUI compose flow doesn't obviously support).

## One-time setup

### 1. Get a domain pointed at the VPS
Add an A record for your domain (or a subdomain like `exomusica.yourdomain.com`)
pointing at the VPS's IP address — in Hostinger this is under hPanel →
Domains → DNS Zone Editor if the domain's also with Hostinger, or your
domain registrar's DNS settings otherwise. Caddy needs this to be live
*before* it first starts, so it can get a TLS certificate automatically.
DNS changes can take a few minutes to an hour to propagate.

### 2. Push the code to a git repo
On Windows (PowerShell or Git Bash — installing [Git for Windows](https://git-scm.com/download/win)
gives you both):

```
cd exomusica
git init
git add -A
git commit -m "Initial commit"
```

Create an empty **private** repository on GitHub (or GitLab), then:

```
git remote add origin https://github.com/<you>/exomusica.git
git branch -M main
git push -u origin main
```

### 3. Install Docker on the VPS (skip if you picked the Docker template)
In the browser terminal (or SSH), check first:

```
docker --version
```

If that fails, install it — on Ubuntu/Debian (Hostinger's default):

```
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and back in for the group change to take effect (close and reopen
the browser terminal), then confirm with `docker --version` and
`docker compose version`.

### 4. Clone the repo onto the VPS

```
git clone https://github.com/<you>/exomusica.git
cd exomusica
```

**A private repo needs a token or key, not your GitHub password** — GitHub
disabled plain username/password login for git operations in 2021. Two
ways to authenticate the VPS's clone/pull, pick one:

- **Personal access token** (fastest): GitHub → Settings → Developer
  settings → Personal access tokens → Tokens (classic) → Generate new
  token, `repo` scope. When `git clone`/`git pull` prompts for a password,
  paste the token instead of your actual password — the username field
  still takes your real GitHub username. Git caches it after the first use
  (in `~/.git-credentials`, plain text — fine for a personal VPS).
- **SSH deploy key** (cleaner for a box that only ever pulls): on the VPS,
  `ssh-keygen -t ed25519 -C "exomusica-vps"` (accept the default path, no
  passphrase needed for automated pulls), then `cat ~/.ssh/id_ed25519.pub`
  and paste that into the repo's **Settings → Deploy keys → Add deploy
  key** (read-only access is enough). Clone with the SSH URL instead of
  HTTPS: `git clone git@github.com:<you>/exomusica.git`.

### 5. Configure environment files
Two `.env` files, neither committed to git (`.gitignore` already excludes
them):

```
cp backend/.env.example backend/.env
```

Edit `backend/.env`:
- `DATABASE_URL` — change only the password to match what you'll set in
  step 6. **Leave the host as `postgres`** — the finished line should look
  like `postgresql://exomusica:<your-password>@postgres:5432/exomusica`.
  `postgres` here is the Docker Compose service name from
  `docker-compose.yml`, not a real hostname — `localhost` will not work,
  since from inside the backend container `localhost` means the backend
  container itself, which has no database on it. (Yes, this is a from-
  experience warning: the shipped `.env.example` used to say `localhost`
  here, which was wrong and caused exactly this failure.)
- `JWT_SECRET` — replace with a long random string (`openssl rand -hex 32`
  works).
- `PORT` — leave as 3001.

Then create a root `.env` (docker-compose reads this one):

```
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" > .env
```

Make sure the password you just generated matches the one in
`backend/.env`'s `DATABASE_URL`.

Optionally set the bootstrap admin account before first seeding:

```
echo "ADMIN_USERNAME=your_username" >> .env
echo "ADMIN_EMAIL=you@example.com" >> .env
echo "ADMIN_PASSWORD=$(openssl rand -hex 12)" >> .env
```

If you skip this, the seed script falls back to `admin` / `changeme123` —
fine to start, but change it immediately after first login (Account page →
Change password). (The backend container loads both this root `.env` and
`backend/.env` — that's deliberate, not a leftover: secrets specific to
the backend service live in `backend/.env`, deploy-level values like this
one and the Postgres password live here. If `ADMIN_USERNAME` doesn't seem
to be taking effect when you seed, check the actual container environment
directly — `docker compose exec backend printenv ADMIN_USERNAME` — rather
than assuming the file content is wrong.)

**Email**: still editing `backend/.env`, fill in the SMTP block with your
real `noreply@exomusica.com` credentials:

```
SMTP_HOST=<your provider's SMTP host>
SMTP_PORT=587
SMTP_USER=noreply@exomusica.com
SMTP_PASSWORD=<the real password>
SMTP_FROM=noreply@exomusica.com
```

This file is never committed to git (`.gitignore` covers it) and I never
see its contents — type it directly into the file on the VPS. Leave
`SMTP_HOST` blank if you want to hold off; anything that would send email
just logs instead of failing.

### 6. Edit the Caddyfile
Replace the placeholder domain:

```
sed -i 's/exomusica.yourdomain.tld/exomusica.yourdomain.com/' Caddyfile
```

(using your real domain from step 1).

### 7. Build and start everything

```
docker compose --env-file .env up -d --build
```

First run takes a few minutes — it's compiling the backend, building the
frontend, and pulling the Postgres image. Watch it with:

```
docker compose logs -f
```

### 8. Create the database tables
The schema exists (`backend/prisma/schema.prisma`) but no migration has
ever been generated against a live database — that had to wait until there
was one. Generate and apply the first migration, bind-mounting the prisma
folder so the generated SQL files land back on the VPS's disk (not just
inside the container, where they'd vanish on the next rebuild):

```
docker compose run --rm -v "$(pwd)/backend/prisma:/app/prisma" backend npx prisma migrate dev --name init
```

Commit the result so it's reproducible:

```
git add backend/prisma/migrations
git commit -m "Add initial migration"
git push
```

Any *future* schema change follows the same pattern (`--name <description>`
instead of `init`) — one bind-mounted `migrate dev` to generate it, then a
git commit. Deploying that change somewhere else later uses
`npx prisma migrate deploy` instead (applies existing migrations, doesn't
generate new ones — the right one for production if you're not the one who
changed the schema).

### 9. Seed the example content and bootstrap admin

```
docker compose exec backend node dist/seed.js
```

This creates the admin account (from step 5's env vars, or the defaults),
a demo branch/album/discussion topic/wiki page/blog post, and is safe to
run again later — it won't duplicate anything that already exists.

### 10. Log in and lock it down
Visit your domain, log in with the admin account, go to **Account** and
change the password if you used the default. From **Admin** you can now
approve real join requests, create real branches, and everything else.

## Importing your Discord history

1. On Windows, copy the whole export folder (the one containing `Attachments`
   subfolders — e.g. `Discord Server backup/`) onto the VPS. `scp` handles
   this fine even with the folder structure intact:

   ```
   scp -r "Discord Server backup" user@your-vps-ip:~/discord-import
   ```

   (Git isn't a good fit here — it's binary media, not code.)

2. Copy the CSV for the channel you're importing into the backend container,
   along with the media folder, via a bind mount for this one command:

   ```
   docker compose run --rm \
     -v ~/discord-import:/import \
     backend node dist/import-discord.js \
     --csv /import/1-2-x-cymatic-step.csv \
     --channel branch-ambient-drift \
     --media-dir /import
   ```

   `--channel` is the *forum channel's* slug, not the branch's — branch
   channels are named `branch-<branch-slug>` (create the branch first, in
   Admin → Branches, if it doesn't exist yet). For a Discussion topic, use
   whatever slug you gave it in Admin → Discussion topics.

3. Read the summary it prints — messages imported, system messages skipped,
   duplicates skipped (safe to re-run the same file), attachments copied vs.
   not found. Not carried over from this CSV format: reply-chains and
   reactions (Discord's CSV export doesn't include a message-id or reply
   column to reconstruct them from).

4. Imported authors show up as ghost accounts (👻 in Admin → Users). If one
   of them joins Exomusica for real later, there's no "claim this account"
   UI yet — that's still a manual DB step for now (matching the `claimToken`
   on the ghost user to the new account).

## Sending the weekly activity summary

There's no in-process scheduler — this is a script meant to be triggered by
a real cron job, since it only needs to run once a week. On the VPS:

```
crontab -e
```

Add a line (runs every Monday at 9am server time):

```
0 9 * * MON cd /home/<you>/exomusica && docker compose exec -T backend node dist/weeklySummary.js >> /home/<you>/weekly-summary.log 2>&1
```

## Redeploying after a code change

On Windows: `git add -A && git commit -m "..." && git push`.
On the VPS:

```
cd exomusica
git pull
docker compose --env-file .env up -d --build
```

If that change touched `schema.prisma`, generate and commit the migration
first (step 8's command), then redeploy.

## Useful commands

- Logs for one service: `docker compose logs -f backend` (or `caddy`, `postgres`)
- Restart without rebuilding: `docker compose restart backend`
- Database backup: `docker compose exec postgres pg_dump -U exomusica exomusica > backup-$(date +%F).sql`
- Shell into the backend container: `docker compose exec backend sh`

## If you want to preview changes before pushing
Not required, but if you want to run things locally on Windows first:
install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
(uses WSL2 under the hood) and run the same `docker compose` commands from
a WSL terminal or PowerShell — or install Node.js and run `npm run dev` in
`backend/` and `frontend/` separately against a local Postgres. Neither is
part of the deployment path above; both are optional dev conveniences.

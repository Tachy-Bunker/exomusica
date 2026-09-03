# Exomusica — Backup, Snapshot & Restore Guide

Your stack has three things worth backing up, all defined as named Docker
volumes in `docker-compose.yml`:

| Volume        | Contains                                          |
|---------------|----------------------------------------------------|
| `pgdata`      | The entire Postgres database — every user, message, album, admin setting |
| `uploads`     | Every file a user or admin has uploaded (attachments, avatars, album art, Moiré images, sound effects, etc.) |
| `caddy_data`  | TLS certificates — regenerates automatically, not worth backing up |

You do **not** need to back up your code — that lives in git.

## 1. One-off snapshot (do this before anything risky: migrations, upgrades, major imports)

Run these from the project root (`~/exomusica`), while the stack is running.

```bash
mkdir -p ~/exomusica-backups
cd ~/exomusica

# 1. Database dump (schema + all data, as a single restorable file)
docker compose exec -T postgres pg_dump -U exomusica -d exomusica -F c \
  > ~/exomusica-backups/db-$(date +%Y-%m-%d-%H%M%S).dump

# 2. Uploaded files (the whole uploads/ volume, as a tarball)
docker run --rm \
  -v exomusica_uploads:/data \
  -v ~/exomusica-backups:/backup \
  alpine tar czf /backup/uploads-$(date +%Y-%m-%d-%H%M%S).tar.gz -C /data .
```

If `exomusica_uploads` isn't the right volume name (Docker prefixes volumes
with the project folder name), find it with:

```bash
docker volume ls | grep uploads
```

Copy these two files off the server (to your own machine, another server,
or cloud storage) — a backup that only lives on the same VPS doesn't
protect you if that VPS dies.

```bash
scp ~/exomusica-backups/*.dump ~/exomusica-backups/*.tar.gz you@your-laptop:~/backups/
```

## 2. Automating it (recommended: daily, via cron)

```bash
crontab -e
```

Add a line to run a backup every night at 3am, keeping the last 7 days
locally (adjust paths/retention as you like):

```cron
0 3 * * * cd ~/exomusica && docker compose exec -T postgres pg_dump -U exomusica -d exomusica -F c > ~/exomusica-backups/db-$(date +\%Y-\%m-\%d).dump && docker run --rm -v exomusica_uploads:/data -v ~/exomusica-backups:/backup alpine tar czf /backup/uploads-$(date +\%Y-\%m-\%d).tar.gz -C /data . && find ~/exomusica-backups -mtime +7 -delete
```

Still copy these off-server periodically (a separate cron job with `rsync`
to another machine, or a small script pushing to S3/Backblaze/etc. — pick
whatever you're comfortable with; this guide doesn't prescribe one).

## 3. Restoring onto a fresh VPS

Starting point: a new server with Docker and Docker Compose installed, and
your `exomusica` repo cloned onto it (`git clone ...`), with your `.env`
files copied over (these are gitignored — copy them separately, they
contain secrets).

```bash
cd ~/exomusica

# 1. Start only postgres first, empty
docker compose up -d postgres

# 2. Wait a few seconds for it to be ready, then restore the dump
docker compose exec -T postgres pg_restore -U exomusica -d exomusica --clean --if-exists \
  < ~/exomusica-backups/db-2026-09-03.dump

# 3. Restore the uploads volume (create it first by starting backend once, or manually)
docker volume create exomusica_uploads
docker run --rm \
  -v exomusica_uploads:/data \
  -v ~/exomusica-backups:/backup \
  alpine tar xzf /backup/uploads-2026-09-03.tar.gz -C /data

# 4. Now bring up everything else
docker compose up -d --build
```

That's it — same database, same files, new server. DNS/domain pointing is
outside Docker's scope; update your DNS A record to the new server's IP
once you've confirmed the restore worked.

## 4. Sanity-checking a restore

Before you trust it and tear down the old server:

```bash
# Confirm data actually came back
docker compose exec postgres psql -U exomusica -d exomusica -c 'SELECT count(*) FROM "User";'
docker compose exec postgres psql -U exomusica -d exomusica -c 'SELECT count(*) FROM "Message";'

# Confirm files came back
docker compose exec backend ls -la /app/uploads
```

## Notes

- `pg_dump -F c` (custom format) is compressed and restorable with
  `pg_restore` — don't mix it up with plain-SQL dumps, which need `psql`
  instead.
- `--clean --if-exists` on restore means it's safe to run against a
  database that already has the old schema in it (drops before
  recreating) — useful if you're testing a restore on the same server
  without wiping the volume first.
- This guide doesn't cover automated off-server replication (e.g.
  streaming Postgres replication to a standby) — for a project this size,
  periodic dumps copied off-server are a reasonable, low-maintenance
  approach. Revisit this if the site grows enough that losing a day of
  data would be a real problem rather than an inconvenience.

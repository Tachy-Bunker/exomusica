#!/bin/bash
# Exomusica daily backup — dumps the database and the uploads volume into
# ~/exomusica-backups, then deletes anything older than RETENTION_DAYS.
# Meant to be run from cron; see the setup instructions for how to install it.

set -euo pipefail

PROJECT_DIR="$HOME/exomusica"
BACKUP_DIR="$HOME/exomusica-backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)

# Adjust this if `docker volume ls` shows a different name for your uploads
# volume — it's usually the project folder name plus "_uploads".
UPLOADS_VOLUME="exomusica_uploads"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

echo "[$TIMESTAMP] Starting backup..."

# 1. Database dump
docker compose exec -T postgres pg_dump -U exomusica -d exomusica -F c \
  > "$BACKUP_DIR/db-$TIMESTAMP.dump"
echo "  Database dumped: db-$TIMESTAMP.dump ($(du -h "$BACKUP_DIR/db-$TIMESTAMP.dump" | cut -f1))"

# 2. Uploaded files
docker run --rm \
  -v "$UPLOADS_VOLUME:/data" \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/uploads-$TIMESTAMP.tar.gz" -C /data .
echo "  Uploads archived: uploads-$TIMESTAMP.tar.gz ($(du -h "$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz" | cut -f1))"

# 3. Prune anything older than RETENTION_DAYS
find "$BACKUP_DIR" -name "db-*.dump" -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "uploads-*.tar.gz" -mtime "+$RETENTION_DAYS" -delete

echo "[$TIMESTAMP] Backup complete. Current backups:"
ls -lh "$BACKUP_DIR"

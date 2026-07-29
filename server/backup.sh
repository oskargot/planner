#!/bin/sh
# Nightly SQLite backup (§9). Uses .backup, not cp — copying a live SQLite
# file can capture a torn write. Keeps 30 dailies.
#
# Install on jellybot:
#   crontab -e
#   30 4 * * * /path/to/planner/server/backup.sh
set -eu

DB="${PLANNER_DB:-$(dirname "$0")/data/planner.db}"
BACKUP_DIR="${PLANNER_BACKUP_DIR:-$(dirname "$0")/data/backups}"

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB" ".backup '$BACKUP_DIR/planner-$(date +%F).db'"

# keep 30 dailies, delete older
ls -1t "$BACKUP_DIR"/planner-*.db 2>/dev/null | tail -n +31 | while read -r f; do
  rm -f "$f"
done

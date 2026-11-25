#!/usr/bin/env bash
set -euo pipefail

# SKYHOP PostgreSQL Backup & Restore Utility
# Usage:
#   ./scripts/backup-db.sh backup [output.sql.gz]
#   ./scripts/backup-db.sh restore <backup.sql.gz>

DATABASE_URL="${DATABASE_URL:-postgresql://skyhop:skyhop_dev_password@localhost:5432/skyhop}"
ACTION="${1:-backup}"

if [[ "$ACTION" == "backup" ]]; then
  OUT_FILE="${2:-skyhop_backup_$(date -u +%Y%m%dT%H%M%SZ).sql.gz}"
  echo "Creating compressed PostgreSQL backup -> $OUT_FILE"
  pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "$OUT_FILE"
  echo "Backup complete: $OUT_FILE"
elif [[ "$ACTION" == "restore" ]]; then
  IN_FILE="${2:?Provide path to backup .sql.gz file}"
  echo "Restoring PostgreSQL backup from $IN_FILE -> $DATABASE_URL"
  gunzip -c "$IN_FILE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
  echo "Restore complete."
else
  echo "Unknown action: $ACTION (expected 'backup' or 'restore')" >&2
  exit 1
fi

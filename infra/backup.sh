#!/usr/bin/env bash
# Backup diario: pg_dump de Postgres + tar de MinIO (documentos/adjuntos) y datos del relay.
# Cron en el host (02:30):  30 2 * * * /opt/latinovation-org-vault/infra/backup.sh >> /var/log/org-vault-backup.log 2>&1
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
[ -f .env ] || { echo "falta infra/.env"; exit 1; }
set -a; . ./.env; set +a

STAMP="$(date -u +%Y-%m-%d_%H%M)"
OUT="backups"; mkdir -p "$OUT"
echo "[$STAMP] pg_dump..."
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT/pg_$STAMP.sql.gz"
echo "[$STAMP] minio + relay..."
tar -czf "$OUT/data_$STAMP.tar.gz" -C data minio relay uploads 2>/dev/null || tar -czf "$OUT/data_$STAMP.tar.gz" -C data minio relay
gzip -t "$OUT/pg_$STAMP.sql.gz" && tar -tzf "$OUT/data_$STAMP.tar.gz" >/dev/null && echo "[$STAMP] verificado"

RET="${BACKUP_RETENTION_DAYS:-14}"
find "$OUT" -name 'pg_*.sql.gz' -mtime +"$RET" -delete
find "$OUT" -name 'data_*.tar.gz' -mtime +"$RET" -delete

if [ -n "${BACKUP_REMOTE:-}" ]; then
  case "$BACKUP_REMOTE" in
    rclone:*) rclone copy "$OUT" "${BACKUP_REMOTE#rclone:}" --include "*_$STAMP.*" ;;
    *) rsync -az "$OUT/" "$BACKUP_REMOTE/" ;;
  esac
  echo "[$STAMP] copiado a $BACKUP_REMOTE"
fi
ls -lh "$OUT" | tail -4

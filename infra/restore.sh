#!/usr/bin/env bash
# Restaura un backup hecho con backup.sh. Para la prueba de restauración de la fase 2.
# Uso: ./restore.sh backups/pg_2026-09-03_0230.sql.gz backups/data_2026-09-03_0230.tar.gz
set -euo pipefail
PG="${1:-}"; DATA="${2:-}"
if [ -f "$PG" ]; then PG="$(cd "$(dirname "$PG")" && pwd)/$(basename "$PG")"; fi
if [ -f "$DATA" ]; then DATA="$(cd "$(dirname "$DATA")" && pwd)/$(basename "$DATA")"; fi
cd "$(dirname "${BASH_SOURCE[0]}")"
[ -f "$PG" ] && [ -f "$DATA" ] || { echo "uso: ./restore.sh <pg_*.sql.gz> <data_*.tar.gz>"; exit 1; }
set -a; . ./.env; set +a

echo "Parando servicios de aplicación..."
docker compose stop control-plane relay-server caddy
echo "Restaurando Postgres..."
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS ${POSTGRES_DB}_restore;" -c "CREATE DATABASE ${POSTGRES_DB}_restore;"
gunzip -c "$PG" | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "${POSTGRES_DB}_restore" -q
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${POSTGRES_DB}';" \
  -c "DROP DATABASE IF EXISTS ${POSTGRES_DB}_old;" -c "ALTER DATABASE ${POSTGRES_DB} RENAME TO ${POSTGRES_DB}_old;" \
  -c "ALTER DATABASE ${POSTGRES_DB}_restore RENAME TO ${POSTGRES_DB};"
echo "Restaurando MinIO y relay..."
docker compose stop minio
rm -rf data/minio data/relay data/uploads
tar -xzf "$DATA" -C data
docker compose up -d
echo "Restaurado. La BD anterior queda como ${POSTGRES_DB}_old (bórrala cuando verifiques)."

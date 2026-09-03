#!/usr/bin/env bash
# Genera infra/.env y infra/relay/relay.toml con secretos y claves nuevas.
#
# Uso:
#   ./setup.sh local [IP-LAN]                 # pruebas en red local, sin TLS (IP detectada si se omite)
#   ./setup.sh prod <dominio> <email-acme>    # VPS con Caddy + Let's Encrypt
# Opciones: --force (sobrescribe .env existente), --admin-email X, --admin-password Y
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

MODE="${1:-}"; shift || true
FORCE=0; ADMIN_EMAIL="${BOOTSTRAP_ADMIN_EMAIL:-admin@latinovation.com}"; ADMIN_PASSWORD="${BOOTSTRAP_ADMIN_PASSWORD:-}"
POSITIONAL=()
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift ;;
    *) POSITIONAL+=("$1") ;;
  esac
  shift
done
set -- "${POSITIONAL[@]:-}"

die() { echo "ERROR: $*" >&2; exit 1; }
command -v docker >/dev/null || die "docker no está instalado"
command -v openssl >/dev/null || die "openssl no está instalado"

detect_ip() {
  if command -v ipconfig >/dev/null 2>&1; then ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
  else hostname -I 2>/dev/null | awk '{print $1}'; fi
}

case "$MODE" in
  local)
    IP="${1:-$(detect_ip)}"; [ -n "$IP" ] || die "no se pudo detectar la IP; pásala: ./setup.sh local 192.168.1.10"
    COMPOSE="docker-compose.yml:docker-compose.local.yml"
    RELAY_PUBLIC_URL="ws://$IP:8080"; RELAY_AUDIENCE="http://$IP:8080"; CP_URL="http://$IP:8000"
    DOMAIN_BASE="localhost"; RELAY_DOMAIN="localhost"; ACME_EMAIL="ops@localhost"; CORS="*"
    ;;
  prod)
    DOMAIN_BASE="${1:-}"; ACME_EMAIL="${2:-}"
    [ -n "$DOMAIN_BASE" ] && [ -n "$ACME_EMAIL" ] || die "uso: ./setup.sh prod <dominio> <email-acme>"
    COMPOSE="docker-compose.yml:docker-compose.prod.yml"
    RELAY_DOMAIN="$DOMAIN_BASE"
    RELAY_PUBLIC_URL="wss://$DOMAIN_BASE"; RELAY_AUDIENCE="https://$DOMAIN_BASE"; CP_URL="https://cp.$DOMAIN_BASE"
    CORS="https://cp.$DOMAIN_BASE"
    ;;
  *) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac

if [ -f .env ] && [ "$FORCE" = 0 ]; then
  die ".env ya existe. Usa --force para regenerarlo (¡invalida claves y tokens existentes!)."
fi

PG_PASS="$(openssl rand -hex 16)"
MINIO_PASS="$(openssl rand -hex 16)"
JWT="$(openssl rand -hex 32)"
[ -n "$ADMIN_PASSWORD" ] || ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"

# Par Ed25519: privada en .env (base64 del PEM), pública raw (últimos 32 bytes del DER) en relay.toml.
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
openssl genpkey -algorithm ed25519 -out "$TMP/relay_private.pem"
RELAY_PRIVATE_KEY="$(openssl base64 -A -in "$TMP/relay_private.pem")"
RELAY_PUBLIC_KEY="$(openssl pkey -in "$TMP/relay_private.pem" -pubout -outform DER | tail -c 32 | openssl base64 -A)"
RELAY_KEY_ID="relay_cp_$(date +%Y%m%d)"

cat > .env <<ENV
# Generado por setup.sh ($MODE) el $(date -u +%Y-%m-%dT%H:%MZ). No subir al repositorio.
COMPOSE_FILE=$COMPOSE

DOMAIN_BASE=$DOMAIN_BASE
RELAY_DOMAIN=$RELAY_DOMAIN
ACME_EMAIL=$ACME_EMAIL

CP_VERSION=latest
RELAY_VERSION=0.9.12

POSTGRES_USER=relay
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=relay
DATABASE_URL=postgresql+psycopg://relay:$PG_PASS@postgres:5432/relay

MINIO_ROOT_USER=relay
MINIO_ROOT_PASSWORD=$MINIO_PASS

JWT_SECRET=$JWT
BOOTSTRAP_ADMIN_EMAIL=$ADMIN_EMAIL
BOOTSTRAP_ADMIN_PASSWORD=$ADMIN_PASSWORD
SERVER_NAME="Latinovation Org"
CORS_ALLOWED_ORIGINS="$CORS"
LOG_LEVEL=INFO
LOG_FORMAT=json

RELAY_PUBLIC_URL=$RELAY_PUBLIC_URL
RELAY_AUDIENCE=$RELAY_AUDIENCE
RELAY_KEY_ID=$RELAY_KEY_ID
RELAY_PRIVATE_KEY=$RELAY_PRIVATE_KEY

BACKUP_RETENTION_DAYS=14
BACKUP_REMOTE=
ENV
chmod 600 .env

sed -e "s|__RELAY_AUDIENCE__|$RELAY_AUDIENCE|" -e "s|__RELAY_KEY_ID__|$RELAY_KEY_ID|" \
    -e "s|__RELAY_PUBLIC_KEY__|$RELAY_PUBLIC_KEY|" -e "s|__MINIO_ROOT_USER__|relay|" \
    -e "s|__MINIO_ROOT_PASSWORD__|$MINIO_PASS|" relay/relay.toml.example > relay/relay.toml
chmod 600 relay/relay.toml
mkdir -p data/postgres data/minio data/uploads data/relay data/caddy data/caddy_config backups

cat <<MSG

Listo ($MODE). Archivos: infra/.env y infra/relay/relay.toml (permisos 600).

  Control plane:  $CP_URL      (panel: $CP_URL/admin-ui/)
  Relay:          $RELAY_PUBLIC_URL
  Admin:          $ADMIN_EMAIL / $ADMIN_PASSWORD   ← guárdalo en el gestor de contraseñas

Siguiente: docker compose up -d && docker compose ps
MSG

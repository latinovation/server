#!/usr/bin/env bash
# Registra el MCP org-vault en Claude Code y crea ~/.org-vault/config.json.
#
# Uso: scripts/install-mcp.sh [--npx] [--with-hook] [--yes]
#   --npx        registra `npx -y @latinovation/mcp-org-vault` (paquete publicado) en vez del build local
#   --with-hook  instala el hook Stop que recuerda escribir cierre de sesión
#   --yes        no pregunta: usa ORG_VAULT_PATH y ORG_VAULT_PERSON del entorno y sobrescribe config
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MCP_DIR="$REPO_DIR/mcp-org-vault"
CONFIG_DIR="$HOME/.org-vault"
CONFIG_FILE="$CONFIG_DIR/config.json"
MODE="local"; WITH_HOOK=0; YES=0

for arg in "$@"; do
  case "$arg" in
    --npx) MODE="npx" ;;
    --with-hook) WITH_HOOK=1 ;;
    --yes|-y) YES=1 ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opción desconocida: $arg" >&2; exit 1 ;;
  esac
done

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }
ask() { # ask VAR "pregunta" "default"
  local var="$1" prompt="$2" default="${3:-}" value
  if [ "$YES" = 1 ]; then value="$default"; else
    read -r -p "$prompt${default:+ [$default]}: " value; value="${value:-$default}"; fi
  printf -v "$var" '%s' "$value"
}

say "1/5 Requisitos"
command -v node >/dev/null || die "Node.js no está instalado (se necesita 20 o superior): https://nodejs.org"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) es demasiado antiguo; se necesita 20 o superior"
command -v claude >/dev/null || die "Claude Code no está instalado o no está en el PATH"
echo "node $(node -v) · claude $(claude --version 2>/dev/null | head -1)"

say "2/5 Baúl y persona"
DETECTED=""
for f in "$HOME/Library/Application Support/obsidian/obsidian.json" "$HOME/.config/obsidian/obsidian.json"; do
  if [ -f "$f" ]; then
    DETECTED="$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=Object.values(d.vaults||{});if(v.length)process.stdout.write(v.map(x=>x.path).join("\n"))' "$f" 2>/dev/null || true)"
    break
  fi
done
if [ -n "$DETECTED" ] && [ "$YES" = 0 ]; then
  echo "Baúles detectados en Obsidian:"; echo "$DETECTED" | sed 's/^/  - /'
fi
DEFAULT_VAULT="${ORG_VAULT_PATH:-$(echo "$DETECTED" | head -1)}"
ask VAULT "Ruta del baúl de Obsidian" "$DEFAULT_VAULT"
VAULT="${VAULT/#\~/$HOME}"
[ -d "$VAULT" ] || die "La carpeta no existe: $VAULT"

DEFAULT_PERSON="${ORG_VAULT_PERSON:-$(whoami | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g; s/^-*//; s/-*$//')}"
ask PERSON "Tu slug de persona (minúsculas, sin acentos, ej. ana o carlos-m)" "$DEFAULT_PERSON"
[[ "$PERSON" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "Slug inválido: $PERSON"

say "3/5 Carpeta Org/"
ORG="$VAULT/Org"
if [ ! -d "$ORG" ]; then
  if [ "$YES" = 1 ]; then COPY="s"; else read -r -p "No existe $ORG. ¿Copiar la plantilla vault-template/Org? [S/n]: " COPY; COPY="${COPY:-s}"; fi
  case "$COPY" in s|S|y|Y) cp -R "$REPO_DIR/vault-template/Org" "$ORG"; echo "Plantilla copiada a $ORG" ;; *) die "Sin Org/ el MCP no puede arrancar. Sincroniza el share del relay o copia la plantilla." ;; esac
fi
mkdir -p "$ORG/aportes/$PERSON"
echo "Tu carpeta: $ORG/aportes/$PERSON"

say "4/5 Configuración ($CONFIG_FILE)"
mkdir -p "$CONFIG_DIR"
if [ -f "$CONFIG_FILE" ] && [ "$YES" = 0 ]; then
  read -r -p "Ya existe. ¿Sobrescribir? [s/N]: " OVER
  case "$OVER" in s|S|y|Y) ;; *) echo "Se conserva la configuración actual."; SKIP_CONFIG=1 ;; esac
fi
if [ -z "${SKIP_CONFIG:-}" ]; then
  node -e 'const [vault,person,file]=process.argv.slice(1);require("fs").writeFileSync(file,JSON.stringify({vaultPath:vault,orgFolder:"Org",person,excludeFolders:["archivo","adjuntos","_plantillas"],maxResults:8,maxNoteChars:6000,usageLog:"~/.org-vault/usage.jsonl"},null,2)+"\n")' "$VAULT" "$PERSON" "$CONFIG_FILE"
  echo "Escrito $CONFIG_FILE"
fi

say "5/5 Registro en Claude Code"
if [ "$MODE" = "npx" ]; then
  CMD=(npx -y @latinovation/mcp-org-vault)
else
  if [ ! -f "$MCP_DIR/dist/index.js" ]; then
    echo "Compilando el MCP (npm install + build)..."
    (cd "$REPO_DIR" && npm install --silent && npm run build --silent -w mcp-org-vault)
  fi
  CMD=(node "$MCP_DIR/dist/index.js")
fi
claude mcp remove org-vault -s user >/dev/null 2>&1 || true
claude mcp add org-vault -s user -- "${CMD[@]}"
echo "Comprobando..."
if [ "$MODE" = "npx" ]; then "${CMD[@]}" --check; else node "$MCP_DIR/dist/index.js" --check; fi

if [ "$WITH_HOOK" = 1 ]; then
  say "Hook Stop (recordatorio de cierre)"
  node "$REPO_DIR/scripts/hooks/install-hook.mjs" "$REPO_DIR/scripts/hooks/remind-session-note.mjs"
fi

say "Listo"
echo "Abre Claude Code en cualquier carpeta y escribe /mcp: org-vault debe aparecer conectado."
echo "Prueba: \"Busca en Org qué sabemos del cliente X y resume en tres líneas\"."

<#
.SYNOPSIS
  Registra el MCP org-vault en Claude Code (Windows) y crea %USERPROFILE%\.org-vault\config.json.
.PARAMETER Npx       Registra `npx -y @latinovation/mcp-org-vault` en vez del build local.
.PARAMETER WithHook  Instala el hook Stop que recuerda escribir cierre de sesión.
.PARAMETER Yes       No pregunta: usa ORG_VAULT_PATH y ORG_VAULT_PERSON del entorno y sobrescribe config.
#>
param([switch]$Npx, [switch]$WithHook, [switch]$Yes)
$ErrorActionPreference = "Stop"

$RepoDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$McpDir = Join-Path $RepoDir "mcp-org-vault"
$ConfigDir = Join-Path $env:USERPROFILE ".org-vault"
$ConfigFile = Join-Path $ConfigDir "config.json"

function Say($t) { Write-Host "`n$t" -ForegroundColor Cyan }
function Die($t) { Write-Host "ERROR: $t" -ForegroundColor Red; exit 1 }
function Ask($prompt, $default) {
  if ($Yes) { return $default }
  $v = Read-Host "$prompt$(if ($default) { " [$default]" })"
  if ([string]::IsNullOrWhiteSpace($v)) { $default } else { $v }
}

Say "1/5 Requisitos"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Die "Node.js no está instalado (se necesita 20 o superior)" }
$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]"))
if ($nodeMajor -lt 20) { Die "Node $(node -v) es demasiado antiguo; se necesita 20 o superior" }
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Die "Claude Code no está instalado o no está en el PATH" }
Write-Host "node $(node -v)"

Say "2/5 Baúl y persona"
$detected = @()
$obsidianJson = Join-Path $env:APPDATA "obsidian\obsidian.json"
if (Test-Path $obsidianJson) {
  try { $detected = @((Get-Content $obsidianJson -Raw | ConvertFrom-Json).vaults.PSObject.Properties.Value.path) } catch {}
}
if ($detected.Count -gt 0 -and -not $Yes) { Write-Host "Baúles detectados en Obsidian:"; $detected | ForEach-Object { Write-Host "  - $_" } }
$defaultVault = if ($env:ORG_VAULT_PATH) { $env:ORG_VAULT_PATH } elseif ($detected.Count -gt 0) { $detected[0] } else { "" }
$Vault = Ask "Ruta del baúl de Obsidian" $defaultVault
if (-not (Test-Path $Vault -PathType Container)) { Die "La carpeta no existe: $Vault" }

$defaultPerson = if ($env:ORG_VAULT_PERSON) { $env:ORG_VAULT_PERSON } else { ($env:USERNAME.ToLower() -replace '[^a-z0-9-]', '-').Trim('-') }
$Person = Ask "Tu slug de persona (minúsculas, sin acentos, ej. ana o carlos-m)" $defaultPerson
if ($Person -notmatch '^[a-z0-9][a-z0-9-]*$') { Die "Slug inválido: $Person" }

Say "3/5 Carpeta Org/"
$Org = Join-Path $Vault "Org"
if (-not (Test-Path $Org)) {
  $copy = if ($Yes) { "s" } else { Read-Host "No existe $Org. ¿Copiar la plantilla vault-template/Org? [S/n]" }
  if ([string]::IsNullOrWhiteSpace($copy) -or $copy -match '^[sSyY]') {
    Copy-Item -Recurse (Join-Path $RepoDir "vault-template\Org") $Org
    Write-Host "Plantilla copiada a $Org"
  } else { Die "Sin Org/ el MCP no puede arrancar." }
}
New-Item -ItemType Directory -Force (Join-Path $Org "aportes\$Person") | Out-Null

Say "4/5 Configuración ($ConfigFile)"
New-Item -ItemType Directory -Force $ConfigDir | Out-Null
$writeConfig = $true
if ((Test-Path $ConfigFile) -and -not $Yes) {
  $over = Read-Host "Ya existe. ¿Sobrescribir? [s/N]"
  if ($over -notmatch '^[sSyY]') { $writeConfig = $false; Write-Host "Se conserva la configuración actual." }
}
if ($writeConfig) {
  @{ vaultPath = $Vault; orgFolder = "Org"; person = $Person; excludeFolders = @("archivo", "adjuntos", "_plantillas"); maxResults = 8; maxNoteChars = 6000; usageLog = "~/.org-vault/usage.jsonl" } |
    ConvertTo-Json | Set-Content -Encoding UTF8 $ConfigFile
  Write-Host "Escrito $ConfigFile"
}

Say "5/5 Registro en Claude Code"
$dist = Join-Path $McpDir "dist\index.js"
if ($Npx) {
  $cmdArgs = @("npx", "-y", "@latinovation/mcp-org-vault")
} else {
  if (-not (Test-Path $dist)) {
    Write-Host "Compilando el MCP (npm install + build)..."
    Push-Location $RepoDir; npm install --silent; npm run build --silent -w mcp-org-vault; Pop-Location
  }
  $cmdArgs = @("node", $dist)
}
claude mcp remove org-vault -s user 2>$null | Out-Null
claude mcp add org-vault -s user -- @cmdArgs
Write-Host "Comprobando..."
& $cmdArgs[0] $cmdArgs[1..($cmdArgs.Length - 1)] --check

if ($WithHook) {
  Say "Hook Stop (recordatorio de cierre)"
  node (Join-Path $RepoDir "scripts\hooks\install-hook.mjs") (Join-Path $RepoDir "scripts\hooks\remind-session-note.mjs")
}

Say "Listo"
Write-Host "Abre Claude Code en cualquier carpeta y escribe /mcp: org-vault debe aparecer conectado."

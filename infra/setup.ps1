# Wrapper de PowerShell para Windows que ejecuta setup.sh usando Git Bash
#
# Uso:
#   .\setup.ps1 local [IP-LAN]
#   .\setup.ps1 prod <dominio> <email-acme>
#   .\setup.ps1 prod <dominio> <email-acme> --force

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Buscar bash priorizando Git Bash (para asegurar openssl y utilidades Unix)
$bashPath = $null
if (Test-Path "C:\Program Files\Git\bin\bash.exe") {
    $bashPath = "C:\Program Files\Git\bin\bash.exe"
} elseif (Test-Path "C:\Program Files\Git\usr\bin\bash.exe") {
    $bashPath = "C:\Program Files\Git\usr\bin\bash.exe"
} else {
    $bashInPath = Get-Command bash -ErrorAction SilentlyContinue
    if ($bashInPath -and $bashInPath.Source -notlike "*System32*") {
        $bashPath = $bashInPath.Source
    }
}

if (-not $bashPath) {
    Write-Error "ERROR: No se encontro Git Bash ni bash en PATH. Instala Git for Windows o ejecuta el script en Git Bash."
    exit 1
}

# 2. Ejecutar setup.sh dentro del directorio infra
Push-Location $scriptDir
try {
    & $bashPath "setup.sh" $args
} finally {
    Pop-Location
}

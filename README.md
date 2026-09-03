# latinovation-org-vault

Sistema de contexto compartido para Latinovation: una carpeta `Org/` dentro del baúl Obsidian de cada persona, sincronizada entre máquinas por un relay CRDT, y un servidor MCP local (`org-vault`) que permite a Claude Code buscar, leer y escribir notas en `Org/` sin cargar carpetas enteras.

- Plan completo: [`docs/PLAN.md`](docs/PLAN.md)
- Reglas del equipo: [`docs/convenciones.md`](docs/convenciones.md)
- Alta de una persona: [`docs/onboarding.md`](docs/onboarding.md)
- Decisiones que cambian el plan: [`docs/decisiones.md`](docs/decisiones.md)

## Estructura

```
docs/             plan, convenciones, onboarding, decisiones
infra/            relay EVC + Caddy (fase 2, pendiente de verificar)
vault-template/   carpeta Org/ inicial para cada baúl
mcp-org-vault/    servidor MCP (TypeScript, stdio, SQLite FTS5)
scripts/          install-mcp.sh / .ps1, usage-report.ts, hooks/
```

## Desarrollo

```bash
npm install            # instala todos los workspaces
npm test               # tests del MCP (vitest)
npm run build          # compila mcp-org-vault/dist/index.js
npm run lint           # eslint + tsc --noEmit
npm run report         # informe de uso (usage.jsonl + ccusage)
npm run smoke          # arranca el binario por stdio contra un baúl temporal
```

Para probar el MCP contra un baúl de prueba sin registrarlo en Claude Code:

```bash
ORG_VAULT_PATH=/ruta/al/baul ORG_VAULT_PERSON=ana node mcp-org-vault/dist/index.js --check
```

## Instalación en una máquina del equipo

```bash
./scripts/install-mcp.sh            # macOS / Linux
.\scripts\install-mcp.ps1           # Windows
```

Ver [`docs/onboarding.md`](docs/onboarding.md).

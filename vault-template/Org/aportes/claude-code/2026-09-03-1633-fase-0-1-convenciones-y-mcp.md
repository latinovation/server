---
tipo: cierre
titulo: "Cierre: fase 0 y fase 1 (convenciones, plantilla y MCP org-vault)"
tags: [fase-0, fase-1, mcp, org-vault]
autor: claude-code
actualizado: 2026-09-03
fuente: claude-code
estado: borrador
---

## Qué se hizo
Fase 0: docs/convenciones.md, vault-template/Org/ (CLAUDE.md y plantillas), docs/onboarding.md y docs/decisiones.md. Fase 1: MCP org-vault en TypeScript con 5 tools y 2 recursos, índice SQLite FTS5 con watcher, 86 tests (incluida la aceptación con 300 notas), install-mcp.sh/.ps1, hook Stop opcional, usage-report y CI.

## Qué se aprendió
FTS5 expone una columna oculta rank: para ordenar con pesos propios hay que usar subconsulta. gray-matter convierte las fechas YAML a Date. Las instrucciones del servidor MCP son la vía fiable para que Org/CLAUDE.md llegue a Claude Code desde cualquier directorio. ccusage daily --json funciona con plan Max.

## Qué queda pendiente
Fase 2: leer el README de EVC Team Relay y verificar imagen Docker, puertos, persistencia y permisos por subcarpeta antes de tocar infra/. Decidir si se publica @latinovation/mcp-org-vault en npm. Nombrar curador y completar la sección Equipo de Org/CLAUDE.md.

## Notas de Org/ consultadas
- [[_plantillas/cierre-sesion]]
- [[_plantillas/nota-contexto]]

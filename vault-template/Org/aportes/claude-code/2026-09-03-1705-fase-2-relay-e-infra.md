---
tipo: cierre
titulo: "Cierre: fase 2 (relay EVC, caddy, docker compose y backup/restore)"
tags: [fase-2, infra, relay, docker, backup]
autor: claude-code
actualizado: 2026-09-03
fuente: claude-code
estado: borrador
---

## Qué se hizo
Fase 2 completada: infra/docker-compose.yml con postgres 16, minio, control-plane y relay-server (EVC v1.12.0) más Caddy 2. Modos LAN (Caddyfile.local) y producción VPS (Caddyfile con TLS). Script setup.sh local/prod con generación de claves Ed25519. Scripts backup.sh y restore.sh probados y verificados en caliente. Decisiones D-013 a D-016 documentadas.

## Qué se aprendió
EVC solo permite permisos por share global, no por subcarpeta (D-016); el MCP protege canónico/ en agentes y en Obsidian se confía en la convención durante el piloto. relay-server exige que RELAY_AUDIENCE coincida exactamente con [server].url en relay.toml. Las variables en .env deben entrecomillarse para permitir source en scripts bash.

## Qué queda pendiente
Fase 3: Iniciar piloto con 3 personas durante 2 semanas con docs/onboarding.md. Desplegar en VPS con dominio y TLS cuando el equipo lo decida. Nombrar curador para revisión semanal de aportes/ y promoción a canónico/.

## Notas de Org/ consultadas
- [[_plantillas/cierre-sesion]]
- [[_plantillas/nota-contexto]]

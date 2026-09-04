# Org Vault: Claude Code + Obsidian para Latinovation

> **Guía Oficial del Sistema**  
> *Versión Verificada · Latinovation · Septiembre 2026*  
> Documento visual e imprimible: [guia-oficial-latinovation.html](file:///Users/macbookpro/BRAYAN/projects/LATINOVATION/ObsidianSinc/docs/guia-oficial-latinovation.html)

---

## Contenido

1. [Objetivo y Filosofía: El Cerebro Compartido](#1-objetivo-y-filosofía-el-cerebro-compartido)
2. [Arquitectura Técnica en Tres Capas](#2-arquitectura-técnica-en-tres-capas)
3. [Convenciones de la Carpeta Org/](#3-convenciones-de-la-carpeta-org)
4. [Onboarding del Equipo en 15 Minutos](#4-onboarding-del-equipo-en-15-minutos)
5. [El Servidor MCP org-vault en Claude Code](#5-el-servidor-mcp-org-vault-en-claude-code)
6. [El Ciclo del Curador y Cierre de Sesión](#6-el-ciclo-del-curador-y-cierre-de-sesión)
7. [Despliegue en VPS con Coolify](#7-despliegue-en-vps-con-coolify)
8. [Operación, Backups y Solución de Problemas](#8-operación-backups-y-solución-de-problemas)

---

## 1. Objetivo y Filosofía: El Cerebro Compartido

En una agencia digital como Latinovation (< 20 personas), el trabajo diario con modelos de IA (Claude Code, ChatGPT, Grok) enfrenta un cuello de botella constante: **la amnesia de contexto**. Cada sesión parte desde cero sin recordar aprendizajes anteriores, decisiones técnicas o particularidades de los clientes.

### La Solución
- **El baúl Obsidian** es el visor humano cómodo y privado de cada persona.
- **La carpeta `Org/`** es el espacio compartido que se sincroniza automáticamente entre máquinas vía **EVC Relay (CRDT)** sin conflictos de Git.
- **El servidor MCP `org-vault`** es el puente sensorial que le permite a Claude Code buscar notas por texto completo en milisegundos (`FTS5`), leer solo las secciones que necesita y escribir notas de cierre de sesión con aprendizajes reutilizables.
- **Ahorro brutal de tokens:** En lugar de cargar baúles enteros de 50.000–100.000 tokens, Claude consulta el índice local y lee fragmentos de 200 caracteres, ahorrando entre **95% y 98% de tokens** por consulta.

---

## 2. Arquitectura Técnica en Tres Capas

```
[ COMPUTADORA PERSONAL ]                                [ OTRA COMPUTADORA DEL EQUIPO ]
┌──────────────────────────────────────┐                ┌──────────────────────────────────────┐
│ 1. Claude Code                       │                │ 1. Claude Code                       │
│    │                                 │                │    │                                 │
│    │ stdio (tubo local)              │                │    │ stdio (tubo local)              │
│    ▼                                 │                │    ▼                                 │
│ 2. MCP Server (org-vault)            │                │ 2. MCP Server (org-vault)            │
│    ├── SQLite FTS5 (Índice local)    │                │    ├── SQLite FTS5 (Índice local)    │
│    └── Chokidar (Vigila cambios)     │                │    └── Chokidar (Vigila cambios)     │
│    │                                 │                │    │                                 │
│    ▼ Lee y escribe en disco          │                │    ▼ Lee y escribe en disco          │
│ 3. Carpeta Org/ (en Obsidian)        │                │ 3. Carpeta Org/ (en Obsidian)        │
│    │                                 │                │    ▲                                 │
│    ▼ Plugin Team Relay               │                │    │ Plugin Team Relay               │
└────┼─────────────────────────────────┘                └────┼─────────────────────────────────┘
     │                                                       │
     │ Sincronización WebSockets / CRDT (Yjs)                │
     ▼                                                       │
┌────────────────────────────────────────────────────────────┼─────────────────────────────────┐
│ [ SERVIDOR RELAY EN PRODUCCIÓN (VPS Coolify) ]             │                                 │
│                                                            │                                 │
│  • Traefik / Ingress: HTTPS y WebSockets con Let's Encrypt automático.                       │
│  • Relay-Server (Rust): Sincronización de documentos CRDT en memoria y MinIO.                │
│  • Control-Plane (FastAPI): Gestión de cuentas, tokens Ed25519 y panel admin.                │
│  • Postgres 16: Base de datos relacional de usuarios y shares.                               │
│  • MinIO: Almacenamiento S3 para persistencia de documentos.                                 │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Convenciones de la Carpeta Org/

Para evitar que el baúl compartido se vuelva un vertedero caótico, el sistema impone reglas estrictas validadas por código en el MCP:

1. **Una idea por nota:** Máximo **500 palabras**. Si se requiere más, se divide en dos notas enlazadas.
2. **`canónico/` vs `aportes/`:**  
   - `Org/canónico/`: Es la verdad validada de la agencia. **Solo la edita el Curador.** El MCP rechaza cualquier intento de un agente de escribir aquí.
   - `Org/aportes/<persona>/`: Es el espacio personal de cada quien (ej: `aportes/brayan/`). Aquí escribe cada persona y su Claude Code.
3. **Frontmatter YAML obligatorio:**  
   Toda nota de contexto incluye:
   ```yaml
   ---
   tipo: cliente | proceso | decision | cierre | referencia
   titulo: "Nombre corto y buscable"
   cliente: "slug-cliente"        # opcional
   tags: [pauta, looker, q4]      # máximo 5
   autor: brayan                  # slug de persona
   actualizado: 2026-09-04
   fuente: humano | claude-code
   estado: borrador | validado    # validado solo en canónico/
   ---
   ```
4. **Seguridad:** Nunca claves, contraseñas ni tokens en `Org/`. Se enlazan al gestor de contraseñas de la empresa.

---

## 4. Onboarding del Equipo en 15 Minutos

Ver la guía completa en [docs/onboarding.md](file:///Users/macbookpro/BRAYAN/projects/LATINOVATION/ObsidianSinc/docs/onboarding.md).

### Pasos Resumidos:
1. **Ajustes de Obsidian:**  
   - *Archivos y enlaces* → Activar *Actualizar enlaces automáticamente*.  
   - *Ubicación de nuevos adjuntos* → *En subcarpeta de la carpeta actual* (`adjuntos`).
2. **Instalar Plugin Team Relay:** Copiar `main.js`, `manifest.json` y `styles.css` a `.obsidian/plugins/team-relay/`.
3. **Conectar al Servidor:**  
   - URL: `https://cp.org.latinovation.com` (o la IP en LAN).  
   - Iniciar sesión con email y contraseña asignados.  
   - Aceptar la invitación al share `Org`.
4. **Registrar MCP en Claude Code:**  
   Ejecutar `./scripts/install-mcp.sh` (macOS/Linux) o `.\scripts\install-mcp.ps1` (Windows).

---

## 5. El Servidor MCP org-vault en Claude Code

El servidor registra 5 herramientas nativas:

| Herramienta | Tipo | Propósito | Ejemplo de Prompt |
|---|---|---|---|
| `search_notes` | Lectura | Búsqueda FTS5 en SQLite (rápida, insensible a mayúsculas y tildes). Devuelve snippets de ≤200 caracteres. | *"Busca en Org qué sabemos del cliente MSD."* |
| `read_note` | Lectura | Lee una nota o una sección específica bajo un encabezado `##`. | *"Lee la sección de pauta de canónico/clientes/msd.md."* |
| `list_notes` | Metadatos | Lista títulos y autores sin cargar el cuerpo (límite 50). | *"Lista las últimas notas de aportes de la semana."* |
| `write_session_note` | Escritura | Genera nota de cierre con 4 secciones fijas en `aportes/<persona>/`. | *"Escribe un cierre de sesión de lo trabajado hoy."* |
| `upsert_context_note` | Escritura | Crea o actualiza nota de contexto validando esquema Zod y límite de 500 palabras. | *"Crea una nota de contexto sobre el nuevo proceso de pauta."* |

---

## 6. El Ciclo del Curador y Cierre de Sesión

Para garantizar que el conocimiento no se degrade:

1. **Cierre de sesión:** Al terminar una tarea reutilizable, el agente llama a `write_session_note` generando un resumen estructurado en:
   - `## Qué se hizo`
   - `## Qué se aprendió`
   - `## Qué queda pendiente`
   - `## Notas de Org/ consultadas`
2. **Revisión semanal:** El Curador revisa `aportes/`, unifica duplicados, promueve notas valiosas a `canónico/` y les asigna `estado: validado`.
3. **Métrica de uso:** Se ejecuta `npm run report` para identificar notas populares y consultas sin resultados (temas pendientes por documentar).

---

## 7. Despliegue en VPS con Coolify

El backend de sincronización (Relay EVC) está preparado para producción en Coolify:
- Guía detallada: [docs/despliegue-coolify.md](file:///Users/macbookpro/BRAYAN/projects/LATINOVATION/ObsidianSinc/docs/despliegue-coolify.md)
- Docker Compose: [`infra/docker-compose.coolify.yml`](file:///Users/macbookpro/BRAYAN/projects/LATINOVATION/ObsidianSinc/infra/docker-compose.coolify.yml)
- Variables de entorno: [`infra/.env.coolify.example`](file:///Users/macbookpro/BRAYAN/projects/LATINOVATION/ObsidianSinc/infra/.env.coolify.example)

---

## 8. Operación, Backups y Solución de Problemas

### Backups Automatizados
Programar en el cron del VPS (`crontab -e`):
```bash
30 2 * * * /opt/latinovation-org-vault/infra/backup.sh >> /var/log/org-vault-backup.log 2>&1
```

### Restauración
Probada y validada en caliente:
```bash
./infra/restore.sh backups/pg_<fecha>.sql.gz backups/data_<fecha>.tar.gz
```

### Solución a Conflictos `(relay conflict ...)`
Ocurre únicamente si dos personas crean notas simultáneas con el título por defecto `Nota nueva.md`. El relay salva ambos archivos para no perder datos. La convención de trabajar en subcarpetas personales (`aportes/<persona>/`) previene este escenario.

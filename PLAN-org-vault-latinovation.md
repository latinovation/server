# Org Vault — Plan de implementación

Sistema de sincronización de contextos entre los baúles Obsidian de Latinovation y los agentes de IA del equipo.

Este documento es el contexto completo para Claude Code. Léelo entero antes de escribir código. Las secciones marcadas **[VERIFICAR]** contienen supuestos que no están comprobados: confírmalos antes de construir encima.

---

## 1. Objetivo

Que lo que una persona (o su agente) aprende quede disponible para el resto del equipo, y viceversa, sin que cada sesión de agente tenga que reconstruir el contexto desde cero.

Resultados medibles al cierre:

1. Cada persona tiene una carpeta `Org/` dentro de su baúl personal que se sincroniza en ambos sentidos con las demás.
2. Claude Code, en cualquier máquina del equipo, puede buscar y leer notas de `Org/` por consulta, sin cargar carpetas enteras.
3. Claude Code puede escribir una nota de cierre de sesión en `Org/aportes/<persona>/` y esa nota aparece en los baúles de los demás.
4. Existe una métrica de reutilización: qué notas se consultan y cuántas sesiones escriben cierre.

Fuera de alcance en esta fase: conectores para ChatGPT o Grok, permisos por nota, medición centralizada de tokens.

---

## 2. Contexto del equipo

- Organización: Latinovation, agencia de marketing digital. Menos de 20 personas.
- Cada persona ya usa Obsidian de escritorio con su propio baúl local.
- Agentes en uso: Claude Code (principal para este sistema), ChatGPT, Grok y otros. Solo Claude Code se integra por MCP en esta fase.
- Planes de IA: Pro y Max (suscripción, no API por token).
- Infraestructura disponible: VPS propios de Latinovation.
- Idioma de trabajo: español. Código, nombres de variables y commits en inglés; documentación y notas en español.

---

## 3. Arquitectura

```
Baúl personal (cada máquina)
  ├── notas privadas            ← nunca sale de la máquina
  └── Org/                      ← carpeta compartida
        ├── canónico/           ← validado por el curador
        ├── aportes/<persona>/  ← lo que cada quien sube
        ├── adjuntos/
        ├── _plantillas/
        └── CLAUDE.md           ← contexto estable del equipo

Org/ de cada persona  ⇄  Relay EVC (VPS, CRDT)  ⇄  Org/ de las demás

Claude Code (cada máquina)
  └── MCP org-vault (stdio, local)
        ├── indexa Org/ de esa máquina (SQLite FTS5)
        ├── search_notes / read_note / list_notes
        └── write_session_note / upsert_context_note  → escribe en Org/ → Relay lo propaga
```

### Decisiones de diseño y por qué

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Carpeta `Org/` dentro del baúl personal | Baúl organizacional separado | La persona no cambia de baúl ni de hábitos; lo privado queda privado. |
| EVC Team Relay (CRDT, self-hosted) | Obsidian Sync, Git, Drive | Sin conflictos para el usuario, permisos por carpeta, datos en VPS propio, open source. |
| MCP **local** por stdio en cada máquina | MCP remoto en el VPS | Claude Code corre en la máquina de la persona y ya tiene `Org/` en disco por el relay. No hace falta red, OAuth ni una réplica en el VPS. Un MCP remoto solo se necesita para agentes externos (fuera de alcance). |
| Índice SQLite FTS5 | Embeddings/vector DB | Menos de 20 personas y unos miles de notas: FTS con frontmatter es suficiente y no requiere llamadas a modelos. Vectorial queda como mejora futura. |
| TypeScript + SDK oficial de MCP | Python/FastMCP | Claude Code y el SDK de MCP tienen mejor soporte en TS; el equipo ya maneja Node. |

### Lo que NO se construye

- No hay servicio web propio para gestionar escrituras: el relay lo hace.
- No hay base de datos central: cada máquina tiene su índice local y se reconstruye desde los archivos.
- No hay panel de tokens: se usan los registros locales de Claude Code.

---

## 4. Stack

| Componente | Tecnología | Versión mínima |
|---|---|---|
| Sincronización | EVC Team Relay (plugin Obsidian + relay server en Docker) | última estable **[VERIFICAR]** |
| Reverse proxy / TLS | Caddy | 2.x |
| MCP server | Node.js + TypeScript, `@modelcontextprotocol/sdk` | Node 20 LTS |
| Índice | `better-sqlite3` con FTS5 | — |
| Watcher de archivos | `chokidar` | 4.x |
| Frontmatter | `gray-matter` | — |
| Validación | `zod` | 3.x |
| Tests | `vitest` | — |
| Empaquetado | `npm` / `npx`; binario único con `tsup` | — |
| Uso de Claude Code | `ccusage` (lectura de logs locales) | — |

---

## 5. Estructura del repositorio

```
latinovation-org-vault/
├── README.md
├── docs/
│   ├── PLAN.md                    ← este documento
│   ├── convenciones.md            ← las reglas del equipo (2 páginas)
│   ├── onboarding.md              ← 15 minutos por persona
│   └── decisiones.md              ← log de decisiones (ADR corto)
├── infra/
│   ├── docker-compose.yml         ← relay EVC + Caddy
│   ├── Caddyfile
│   └── .env.example
├── vault-template/
│   └── Org/
│       ├── CLAUDE.md
│       ├── canónico/{clientes,procesos,decisiones}/.gitkeep
│       ├── aportes/.gitkeep
│       ├── adjuntos/.gitkeep
│       └── _plantillas/
│           ├── nota-contexto.md
│           └── cierre-sesion.md
├── mcp-org-vault/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               ← entrada stdio
│   │   ├── config.ts              ← ruta de Org/, persona, opciones
│   │   ├── indexer/
│   │   │   ├── db.ts              ← SQLite + FTS5, esquema, migraciones
│   │   │   ├── scanner.ts         ← recorrido inicial + chokidar
│   │   │   └── parser.ts          ← frontmatter, secciones, wikilinks
│   │   ├── tools/
│   │   │   ├── search-notes.ts
│   │   │   ├── read-note.ts
│   │   │   ├── list-notes.ts
│   │   │   ├── write-session-note.ts
│   │   │   └── upsert-context-note.ts
│   │   ├── usage-log.ts           ← registro de consultas (JSONL)
│   │   └── server.ts              ← registro de tools y resources
│   └── test/
├── scripts/
│   ├── install-mcp.sh             ← registra el MCP en Claude Code
│   ├── install-mcp.ps1
│   └── usage-report.ts            ← resume usage-log + ccusage
└── .github/workflows/ci.yml
```

---

## 6. Convenciones del baúl (contenido de `docs/convenciones.md`)

Estas reglas son las que hacen que el sistema ahorre contexto. El MCP las valida donde puede.

### Estructura de `Org/`

- `canónico/`: conocimiento validado. Solo el curador edita. Subcarpetas `clientes/`, `procesos/`, `decisiones/`.
- `aportes/<persona>/`: cada persona escribe aquí. Slug en minúsculas sin acentos (`ana`, `carlos-m`).
- `adjuntos/`: imágenes y archivos. Obsidian debe configurarse para guardar adjuntos en subcarpeta de la carpeta actual.
- `_plantillas/`: plantillas comunes.
- `archivo/`: notas sin consulta en 90 días. Excluido del índice del MCP.

### Nota de contexto (frontmatter obligatorio)

```yaml
---
tipo: cliente | proceso | decision | cierre | referencia
titulo: "Nombre corto"
cliente: "slug-cliente"        # opcional
tags: [a, b]
autor: ana                     # slug de persona
actualizado: 2026-09-03
fuente: humano | claude-code | chatgpt | grok | otro
estado: borrador | validado    # validado solo en canónico/
---
```

Cuerpo: máximo 500 palabras. Una idea por nota. Enlaces solo a notas dentro de `Org/`.

### Nota de cierre de sesión

Archivo: `aportes/<persona>/YYYY-MM-DD-HHmm-<slug>.md`, `tipo: cierre`. Máximo 10 líneas de cuerpo:

```
## Qué se hizo
## Qué se aprendió
## Qué queda pendiente
## Notas de Org/ consultadas
```

### Reglas para agentes

1. Buscar antes de leer: `search_notes` primero, `read_note` solo para los resultados relevantes.
2. Nunca listar ni leer `Org/` completo.
3. Al terminar una tarea con resultado reutilizable, escribir cierre con `write_session_note`.
4. No escribir en `canónico/` (el MCP lo rechaza).

---

## 7. Especificación del MCP `org-vault`

### Configuración

Variables de entorno o `~/.org-vault/config.json`:

```json
{
  "vaultPath": "/Users/ana/Obsidian/MiBaul",
  "orgFolder": "Org",
  "person": "ana",
  "excludeFolders": ["archivo", "adjuntos", "_plantillas"],
  "maxResults": 8,
  "maxNoteChars": 6000,
  "usageLog": "~/.org-vault/usage.jsonl"
}
```

El servidor falla al arrancar, con mensaje claro, si `vaultPath/Org` no existe o `person` está vacío.

### Índice

Esquema SQLite (`~/.org-vault/index.db`):

```sql
CREATE TABLE notes (
  path TEXT PRIMARY KEY,        -- relativo a Org/
  title TEXT, tipo TEXT, cliente TEXT, autor TEXT, estado TEXT,
  tags TEXT,                    -- JSON array
  actualizado TEXT, mtime INTEGER, size INTEGER, hash TEXT
);
CREATE VIRTUAL TABLE notes_fts USING fts5(
  path UNINDEXED, title, body, tags, cliente,
  tokenize = 'unicode61 remove_diacritics 2'
);
```

Comportamiento:

- Al arrancar: escaneo completo de `Org/` excluyendo `excludeFolders`; reindexa solo si `hash` cambió.
- Durante la sesión: `chokidar` observa `Org/`; cambios se reindexan con debounce de 500 ms. Los cambios que llegan por el relay se ven como cambios de archivo normales, así que el índice se mantiene al día sin integración especial con EVC.
- Notas sin frontmatter válido se indexan igual, con `tipo: null`, y se reportan en `list_notes` con `warnings`.

### Tools

Todas las respuestas son JSON. Ningún tool devuelve más de `maxNoteChars` por nota.

**`search_notes`**

```
input:  { query: string, tipo?: string, cliente?: string, autor?: string,
          soloCanonico?: boolean, limit?: number }
output: { results: [{ path, title, tipo, cliente, estado, actualizado,
                      snippet, score }], total }
```
- FTS5 con `bm25`. Prefijo `*` para términos parciales. Query vacía → error.
- `snippet`: fragmento de ≤200 caracteres alrededor del match.
- Ordena: `canónico/` con `estado: validado` primero a igualdad de score.

**`read_note`**

```
input:  { path: string, section?: string }
output: { path, frontmatter, body, links: string[], truncated: boolean }
```
- `section`: devuelve solo el bloque bajo ese encabezado `##`.
- Rechaza rutas fuera de `Org/` (path traversal).

**`list_notes`**

```
input:  { folder?: string, tipo?: string, cliente?: string,
          desde?: string (ISO), limit?: number }
output: { notes: [{ path, title, tipo, actualizado, autor }], warnings }
```
- Solo metadatos, nunca cuerpo. Límite máximo 50.

**`write_session_note`**

```
input:  { slug: string, hizo: string, aprendio: string,
          pendiente?: string, consultadas?: string[], cliente?: string, tags?: string[] }
output: { path }
```
- Escribe en `aportes/<person>/YYYY-MM-DD-HHmm-<slug>.md` usando la plantilla y frontmatter completo (`fuente: claude-code`, `estado: borrador`).
- Rechaza si el cuerpo resultante supera 1500 caracteres.

**`upsert_context_note`**

```
input:  { path: string, frontmatter: object, body: string }
output: { path, created: boolean }
```
- Solo permite rutas bajo `aportes/<person>/`. Rechaza `canónico/` y carpetas de otras personas.
- Valida frontmatter con zod contra el esquema de la sección 6. Rechaza cuerpo > 500 palabras.

### Resources

- `orgvault://claude-md` → contenido de `Org/CLAUDE.md`.
- `orgvault://plantillas/{nombre}` → plantillas.

### Registro de uso

Cada llamada a `search_notes` y `read_note` añade una línea a `usage.jsonl`:

```json
{"ts":"2026-09-03T14:02:11Z","person":"ana","tool":"read_note","path":"canónico/clientes/msd.md","query":null}
```

`scripts/usage-report.ts` agrega por semana: notas más leídas, consultas sin resultado (candidatas a documentar), cierres escritos, y combina con la salida de `ccusage --json` si está disponible.

### Integración con Claude Code

`scripts/install-mcp.sh` ejecuta:

```bash
claude mcp add org-vault -s user -- npx -y @latinovation/mcp-org-vault
```

y crea `~/.org-vault/config.json` preguntando ruta del baúl y slug de persona. **[VERIFICAR]** sintaxis exacta de `claude mcp add` en la versión instalada; consultar `claude mcp --help`.

`Org/CLAUDE.md` incluye la instrucción explícita a Claude Code de usar `search_notes` antes de cualquier lectura y de escribir cierre al terminar. Opcional: hook `Stop` de Claude Code que recuerde escribir cierre si no se llamó `write_session_note` en la sesión. **[VERIFICAR]** disponibilidad de hooks en la versión instalada.

---

## 8. Infraestructura (relay)

`infra/docker-compose.yml` levanta:

- `relay`: imagen del relay server de EVC Team Relay. **[VERIFICAR]** nombre de imagen, puertos, variables de entorno y persistencia según el README oficial del repositorio `entire-vc`. No inventar valores.
- `caddy`: TLS automático para `relay.<dominio>`.

Requisitos del VPS: Docker + Compose, dominio apuntando al VPS, puertos 80/443 abiertos, volumen persistente para los datos del relay, backup diario del volumen (cron + `tar` a almacenamiento externo).

Permisos en el relay:

- `Org/canónico/` → visor para todos, editor para el curador.
- `Org/aportes/<persona>/` → editor para su dueño, visor para el resto.
- `Org/adjuntos/`, `_plantillas/`, `CLAUDE.md` → editor para el curador.

**[VERIFICAR]** que EVC permite permisos por subcarpeta con esa granularidad. Si solo permite por share, crear un share por carpeta.

---

## 9. Fases y tareas

### Fase 0 — Convenciones y plantilla (Claude Code, 1–2 días)

- [x] Redactar `docs/convenciones.md` con el contenido de la sección 6.
- [x] Crear `vault-template/Org/` con estructura, plantillas y `CLAUDE.md`.
- [x] Redactar `docs/onboarding.md`: instalar plugin, pegar clave, configurar adjuntos, activar "actualizar enlaces al mover", ejecutar `install-mcp`.
- **Aceptación:** una persona sin contexto previo completa el onboarding en 15 minutos siguiendo el documento.

### Fase 1 — MCP `org-vault` (Claude Code, 3–5 días)

- [x] Scaffold TS, SDK MCP, stdio transport.
- [x] `parser.ts` + tests: frontmatter, secciones, wikilinks, notas malformadas.
- [x] `db.ts` + `scanner.ts`: escaneo inicial, hash, watcher, exclusiones.
- [x] Tools en el orden: `read_note`, `search_notes`, `list_notes`, `write_session_note`, `upsert_context_note`.
- [x] Seguridad: path traversal, escritura solo en `aportes/<person>/`, límites de tamaño.
- [x] `usage-log.ts` y `scripts/usage-report.ts`.
- [x] `install-mcp.sh` / `.ps1`.
- [x] CI: lint, tests, build.
- **Aceptación:** con un `Org/` de prueba de 300 notas, `search_notes("MSD HubSpot")` responde en < 200 ms y devuelve ≤ 8 resultados con snippet; `write_session_note` crea un archivo válido según las convenciones; una escritura en `canónico/` es rechazada.

### Fase 2 — Relay e Infraestructura (humano + Claude Code, 2–3 días)

- [x] Leer README de EVC y completar `docker-compose.yml` y `Caddyfile` sin placeholders (D-014, D-015).
- [x] Desplegar en local/LAN, configurar ingress y verificar endpoints de salud (control plane, relay, minio, postgres).
- [x] Backup diario y prueba de restauración (`backup.sh` y `restore.sh` verificados en caliente).
- **Aceptación técnica completada:** Stack operativo en LAN, scripts validados con datos reales; listo para prueba de dos máquinas en el piloto (Fase 3).

### Fase 3 — Piloto (2 semanas, 3 personas)

- [ ] Onboarding de 3 personas con `docs/onboarding.md`.
- [ ] Cada una escribe 3–5 notas de contexto de sus clientes en `aportes/`.
- [ ] Uso diario de Claude Code con el MCP; cierre de sesión al terminar tareas reutilizables.
- [ ] El curador promueve a `canónico/` semanalmente.
- **Aceptación (criterio para pasar a fase 4):** cero pérdida de datos, cero conflictos visibles, `usage-report` muestra lecturas de `canónico/` por personas distintas al autor, y las 3 personas califican el onboarding como "sencillo".
- **Si falla el relay:** cambiar a Relay de System 3 sin tocar el MCP (el MCP solo ve archivos).

### Fase 4 — Despliegue al equipo (1 semana)

- [ ] Onboarding del resto.
- [ ] Migración inicial de contexto por persona.
- [ ] Nombrar curador y fijar día de revisión semanal.

### Fase 5 — Operación

- Curador: revisión semanal de `aportes/`, promoción a `canónico/`, poda a `archivo/` a los 90 días sin consulta (dato de `usage-report`).
- Revisión mensual de `usage-report`: consultas sin resultado → notas por escribir.
- Mejoras candidatas, por orden: búsqueda semántica local (embeddings en SQLite), MCP remoto en VPS para agentes externos, hook de cierre automático.

---

## 10. Puntos a verificar antes de construir

| # | Supuesto | Cómo verificar | Si falla |
|---|---|---|---|
| 1 | EVC Team Relay se despliega en Docker con documentación suficiente | Leer README del repo `entire-vc/evc-team-relay-obsidian-plugin` y del relay server | Usar Relay de System 3 (relay en VPS, login vía sus servidores) |
| 2 | EVC sincroniza adjuntos además de `.md` y qué tamaño máximo | Prueba en fase 2 | Adjuntos por carpeta compartida en Drive, enlazados desde la nota |
| 3 | EVC permite permisos visor/editor por subcarpeta | Prueba en fase 2 | Un share por carpeta |
| 4 | `claude mcp add` acepta la forma indicada | `claude mcp --help` | Editar `~/.claude.json` manualmente en el script |
| 5 | Hooks de Claude Code disponibles | Documentación de la versión instalada | Instrucción en `CLAUDE.md` solamente |
| 6 | `ccusage` lee los logs de Claude Code bajo plan Max | Ejecutar `npx ccusage` en una máquina del equipo | Solo `usage.jsonl` del MCP |
| 7 | FTS5 disponible en el binario de `better-sqlite3` | `SELECT fts5(?1)` en test | Compilar con FTS5 o usar `sqlite3` con extensión |

---

## 11. Limitaciones aceptadas

- Grok y otros agentes sin MCP reciben contexto pegado a mano desde `Org/`.
- No hay medición central de tokens; solo registros locales y el log del MCP.
- Permisos por carpeta, no por nota. Lo confidencial va en carpeta con share propio.
- El ahorro depende de la disciplina de escritura. Notas largas o volcados de agentes en `Org/` revierten el beneficio; el MCP limita tamaños pero no puede impedir que alguien pegue un archivo grande desde Obsidian.
- Sin curador activo, `aportes/` crece y `canónico/` se desactualiza.
- EVC es reciente; la fase 3 decide si se queda.

---

## 12. Instrucciones para Claude Code

1. Empieza por la fase 0 y la fase 1; no toques `infra/` hasta verificar el punto 1 de la sección 10.
2. Cada tool del MCP tiene tests antes de marcarse como hecha.
3. No inventes valores de configuración del relay: si el README no lo dice, deja `[VERIFICAR]` y pregunta.
4. Registra cada decisión que cambie este plan en `docs/decisiones.md` con fecha y razón.
5. Al terminar cada fase, escribe una nota de cierre en `vault-template/Org/aportes/claude-code/` siguiendo la plantilla: es la primera prueba real del sistema.

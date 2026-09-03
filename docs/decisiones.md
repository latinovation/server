# Registro de decisiones

Formato: fecha · decisión · razón · impacto en el plan. Las decisiones más recientes van arriba.

## 2026-09-03 · Fase 0 y fase 1

### D-012 · `Org/CLAUDE.md` no se indexa
- **Razón:** ya viaja como instrucciones del servidor y como recurso `orgvault://claude-md`; indexarlo haría que apareciera en búsquedas con avisos de "sin frontmatter" y compitiera con las notas reales.
- **Impacto:** ninguno para las personas. `search_notes` nunca devuelve `CLAUDE.md`.

### D-011 · `search_notes` intenta AND y, si no hay resultados, reintenta con OR
- **Razón:** con consultas de dos o tres términos ("MSD HubSpot reporte") el AND estricto devuelve cero resultados con demasiada frecuencia; el reintento con OR mantiene la precisión cuando hay coincidencia completa y evita respuestas vacías inútiles.
- **Impacto:** el registro de uso marca `results: 0` solo cuando ni AND ni OR encontraron nada, que es la señal real de "nota por escribir".

### D-010 · El hook `Stop` de Claude Code se implementa como opcional (`install-mcp.sh --with-hook`)
- **Verificado:** Claude Code 2.1.259 soporta hooks en `settings.json`, incluido el evento `Stop` con `stop_hook_active` para evitar bucles (punto 5 de la sección 10).
- **Razón:** el hook solo actúa si la sesión usó tools de `org-vault` y no llamó a `write_session_note`; aun así puede resultar molesto, así que cada persona decide.
- **Impacto:** ninguno en el MCP. El hook vive en `scripts/hooks/remind-session-note.mjs`.

### D-009 · `install-mcp.sh` registra el build local por defecto; `--npx` usa el paquete publicado
- **Razón:** `@latinovation/mcp-org-vault` no está publicado en npm todavía y publicarlo no es tarea de esta fase. Durante el piloto cada máquina clona el repo y ejecuta el build.
- **Impacto:** el comando registrado es `node <repo>/mcp-org-vault/dist/index.js`. Cuando se publique, se ejecuta de nuevo el script con `--npx`.

### D-008 · Las instrucciones del servidor MCP incluyen el contenido de `Org/CLAUDE.md`
- **Razón:** Claude Code solo carga `CLAUDE.md` del directorio de trabajo y sus ancestros. Si la persona trabaja en un proyecto fuera del baúl, `Org/CLAUDE.md` no se cargaría. El campo `instructions` del servidor MCP sí llega a Claude Code en cualquier directorio.
- **Impacto:** el curador edita `Org/CLAUDE.md` y todas las máquinas reciben el cambio al reiniciar Claude Code. También sigue disponible como recurso `orgvault://claude-md`.

### D-007 · El registro de uso también anota `write_session_note` y el número de resultados de cada búsqueda
- **Razón:** el plan pide que `usage-report` muestre "consultas sin resultado" y "cierres escritos". Sin `results` en la línea de búsqueda ni el registro de escrituras, el informe tendría que inferirlos.
- **Impacto:** una línea de `usage.jsonl` tiene los campos `ts, person, tool, path, query, results`. Los que no aplican van en `null`.

### D-006 · La plantilla de cierre está embebida en el código; `_plantillas/cierre-sesion.md` es la copia para humanos
- **Razón:** si el MCP leyera la plantilla del baúl, cualquier edición en Obsidian rompería la generación. Las dos copias tienen la misma estructura y el test de `write_session_note` verifica que el resultado cumple las convenciones.
- **Impacto:** cambiar la estructura del cierre implica cambiar ambos archivos y el test.

### D-005 · `write_session_note` acepta `titulo` opcional
- **Razón:** el plan no incluía `titulo` en la entrada, pero el frontmatter lo exige. Si no se pasa, se deriva del slug ("Cierre: propuesta pauta q4").
- **Impacto:** ninguno para quien no lo use.

### D-004 · El índice guarda dos columnas extra: `folder` y `warnings`
- **Razón:** `folder` (primer segmento de la ruta) hace barato filtrar por `canónico/` o `aportes/<persona>/`. `warnings` (JSON) guarda los problemas de frontmatter detectados al indexar para que `list_notes` los reporte sin releer archivos.
- **Impacto:** el esquema de la sección 7 se amplía; nada se elimina.

### D-003 · `archivo/` se incluye en `vault-template/Org/`
- **Razón:** las convenciones la mencionan y el MCP la excluye del índice; crearla desde el inicio evita que cada persona la cree con otro nombre.

### D-002 · Versiones: TypeScript 5.9, chokidar 4, zod 3.25, SDK MCP 1.30
- **Razón:** TypeScript 7 (port nativo) todavía no es compatible con todo el tooling (typescript-eslint, tsup). chokidar 5 salió después del plan; 4.x es la versión que el plan pide y es estable. zod 3.25 es la versión mínima que el SDK 1.30 acepta y la que el plan indica.
- **Impacto:** ninguno funcional. Revisar en fase 5.

### D-001 · El repositorio vive en esta carpeta (`ObsidianSinc/`), con `package.json` raíz y npm workspaces
- **Razón:** la carpeta ya existe y contiene el plan; renombrarla a `latinovation-org-vault` es cosmético y lo puede hacer el equipo al publicar en GitHub. El workspace permite que `scripts/usage-report.ts` reutilice las dependencias de `mcp-org-vault/`.
- **Impacto:** `docs/PLAN.md` es la copia canónica del plan; `PLAN-org-vault-latinovation.md` en la raíz se puede borrar cuando el equipo lo decida.

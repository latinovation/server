# Latinovation · contexto para agentes

Este archivo lo mantiene el curador. Llega a Claude Code como instrucciones del MCP `org-vault` en cualquier directorio de trabajo. Mantenerlo por debajo de 60 líneas.

## Qué es `Org/`

Carpeta compartida del equipo, sincronizada entre los baúles Obsidian de todas las personas. Contiene contexto de clientes, procesos y decisiones. Lo privado de cada persona está fuera de `Org/` y no es visible.

- `canónico/`: validado por el curador. Fuente de verdad.
- `aportes/<persona>/`: contexto y cierres de cada persona. Puede estar desactualizado.
- `_plantillas/`: plantillas. `archivo/`: notas viejas, fuera del índice.

## Cómo usar el MCP `org-vault`

1. **Buscar antes de leer.** Empieza toda tarea relacionada con un cliente, proceso o decisión del equipo con `search_notes`. Lee con `read_note` solo los resultados relevantes, y usa `section` cuando solo necesites una parte.
2. **Nunca listes ni leas `Org/` completo.** `list_notes` es para metadatos, nunca para recorrer el baúl.
3. **Prioriza `canónico/`** sobre `aportes/`. Si hay contradicción, gana la nota con `estado: validado`.
4. **Al terminar una tarea con resultado reutilizable, escribe un cierre** con `write_session_note`: qué se hizo, qué se aprendió, qué queda pendiente, qué notas de `Org/` sirvieron. Máximo 10 líneas. Si el resultado no le sirve a nadie más, no escribas cierre.
5. **Contexto nuevo va a `aportes/<tu-persona>/`** con `upsert_context_note`, una idea por nota, menos de 500 palabras. Nunca escribas en `canónico/` ni en la carpeta de otra persona: el MCP lo rechaza.
6. **Nada de claves ni tokens** en ninguna nota.

## Equipo

<!-- El curador completa esta sección. Solo datos estables: cambian menos de una vez al mes. -->

- Organización: Latinovation, agencia de marketing digital.
- Idioma de trabajo: español. Código y commits en inglés.
- Curador de `Org/`: [completar]
- Herramientas del equipo: [completar: CRM, pauta, reportes, gestor de proyectos]
- Clientes activos: consulta `search_notes` con `tipo: cliente` y `soloCanonico: true`.

## Convenciones

Resumen de `docs/convenciones.md`. Frontmatter obligatorio en toda nota: `tipo, titulo, tags, autor, actualizado, fuente, estado`. Slugs en minúsculas sin acentos. Enlaces solo dentro de `Org/`.

# Convenciones del baúl `Org/`

Versión 1.0 · 2026-09-03 · Aplica a todas las personas de Latinovation con la carpeta `Org/` sincronizada.

Estas reglas existen por una razón: que los agentes (y las personas) encuentren lo que necesitan leyendo lo mínimo. El MCP `org-vault` valida lo que puede; el resto depende de cada quien.

## 1. Estructura de `Org/`

| Carpeta | Qué va | Quién escribe |
|---|---|---|
| `canónico/` | Conocimiento validado. Subcarpetas `clientes/`, `procesos/`, `decisiones/`. | Solo el curador |
| `aportes/<persona>/` | Lo que cada quien aporta: contexto de clientes, aprendizajes, cierres de sesión. | Cada persona en su carpeta |
| `adjuntos/` | Imágenes y archivos. | Cualquiera, desde Obsidian |
| `_plantillas/` | Plantillas comunes. | Curador |
| `archivo/` | Notas sin consulta en 90 días. Excluido del índice del MCP. | Curador |
| `CLAUDE.md` | Contexto estable del equipo para agentes. | Curador |

- **Slug de persona:** minúsculas, sin acentos ni espacios, guiones si hace falta: `ana`, `carlos-m`. Es el nombre de la carpeta en `aportes/` y el valor de `autor`.
- **Adjuntos:** Obsidian debe guardar adjuntos en subcarpeta de la carpeta actual (ver onboarding). Así un adjunto pegado en una nota de `Org/` queda dentro de `Org/` y se sincroniza.
- **Enlaces:** solo a notas dentro de `Org/`. Un enlace a una nota privada se rompe en las máquinas de las demás.
- **Mover notas:** solo el curador mueve notas entre carpetas (por ejemplo de `aportes/` a `canónico/`). Obsidian debe tener activado "actualizar enlaces automáticamente".

## 2. Nota de contexto

Una idea por nota. Máximo 500 palabras de cuerpo. Si necesitas más, son dos notas.

Frontmatter obligatorio:

```yaml
---
tipo: cliente | proceso | decision | cierre | referencia
titulo: "Nombre corto"
cliente: "slug-cliente"        # opcional; minúsculas sin acentos
tags: [a, b]
autor: ana                     # slug de persona
actualizado: 2026-09-03
fuente: humano | claude-code | chatgpt | grok | otro
estado: borrador | validado    # validado solo en canónico/
---
```

Significado de cada `tipo`:

| tipo | Uso | Ejemplo de título |
|---|---|---|
| `cliente` | Quién es, qué contrató, qué le importa, con quién se habla. | "MSD: contexto de cuenta" |
| `proceso` | Cómo hacemos algo en Latinovation. | "Cómo armamos un reporte mensual de pauta" |
| `decision` | Qué se decidió, cuándo y por qué. | "Migrar reportes de MSD a Looker" |
| `cierre` | Cierre de sesión de trabajo (ver sección 3). | Se genera solo |
| `referencia` | Datos estables: accesos (sin claves), IDs, enlaces, glosario. | "IDs de cuentas publicitarias" |

Reglas:

- `titulo` corto y buscable: incluye el nombre del cliente si aplica.
- `tags` en minúsculas, sin acentos. Máximo cinco.
- `actualizado` se cambia cada vez que se edita el cuerpo.
- `estado: validado` solo lo pone el curador y solo dentro de `canónico/`.
- Nunca claves, contraseñas ni tokens en `Org/`. Enlaza al gestor de contraseñas.

## 3. Nota de cierre de sesión

La escribe el agente (o la persona) al terminar una tarea cuyo resultado sirva a alguien más.

- Archivo: `aportes/<persona>/YYYY-MM-DD-HHmm-<slug>.md`
- Frontmatter: `tipo: cierre`, `fuente` según quién la escribe, `estado: borrador`.
- Cuerpo: máximo 10 líneas, con exactamente estas cuatro secciones:

```
## Qué se hizo
## Qué se aprendió
## Qué queda pendiente
## Notas de Org/ consultadas
```

Lo que va en cada sección:

- **Qué se hizo:** el resultado, no el proceso. "Se armó la propuesta de pauta Q4 para MSD", no "se abrieron varios archivos".
- **Qué se aprendió:** lo que alguien más debería saber antes de repetir la tarea. Si no hay nada, escribe "Nada nuevo".
- **Qué queda pendiente:** lo que sigue y quién lo tiene.
- **Notas consultadas:** enlaces `[[ruta]]` a las notas de `Org/` que sirvieron. Es la señal de reutilización.

Los cierres que contengan algo valioso los convierte el curador en una nota de contexto. Los demás se archivan a los 90 días.

## 4. Reglas para agentes

Están también en `Org/CLAUDE.md` y en las instrucciones del MCP. Se repiten aquí para que las personas sepan qué esperar.

1. **Buscar antes de leer.** `search_notes` primero; `read_note` solo para los resultados relevantes.
2. **Nunca listar ni leer `Org/` completo.** `list_notes` devuelve solo metadatos y como máximo 50 notas.
3. **Al terminar una tarea con resultado reutilizable, escribir cierre** con `write_session_note`.
4. **No escribir en `canónico/`.** El MCP lo rechaza. Tampoco en la carpeta de otra persona.
5. **Notas cortas.** El MCP rechaza cierres de más de 1500 caracteres y notas de contexto de más de 500 palabras.

## 5. Ciclo del curador

- **Semanal:** revisar `aportes/` de la semana; promover a `canónico/` lo que aplique (mover la nota, poner `estado: validado`, ajustar `titulo` y `tags`).
- **Mensual:** revisar `usage-report`: consultas sin resultado son notas por escribir; notas sin lecturas en 90 días van a `archivo/`.
- **Siempre:** una nota canónica por tema. Si dos aportes hablan de lo mismo, se fusionan.

## 6. Qué no va en `Org/`

- Notas personales, borradores de ideas, listas de tareas propias: se quedan fuera de `Org/`.
- Volcados de conversaciones con agentes, transcripciones, exportaciones grandes: rompen el ahorro de contexto.
- Archivos de más de 5 MB **[VERIFICAR en fase 2 el límite real del relay]**.
- Cualquier dato confidencial que no deba ver todo el equipo: va en una carpeta con share propio (fase 2).

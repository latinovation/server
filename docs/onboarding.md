# Onboarding · 15 minutos

Al terminar tendrás la carpeta `Org/` en tu baúl, sincronizada con el equipo, y Claude Code podrá buscar y escribir en ella.

Necesitas: Obsidian de escritorio instalado con tu baúl abierto, Node 20 o superior, Claude Code instalado, y la clave del share de `Org/` que te da el curador.

## 1. Ajustes de Obsidian (3 min)

En Ajustes → Archivos y enlaces:

1. **Ubicación de nuevos adjuntos:** "En subcarpeta de la carpeta actual", nombre de subcarpeta `adjuntos`. Así los adjuntos pegados en notas de `Org/` quedan dentro de `Org/`.
2. **Actualizar enlaces automáticamente:** activado. Cuando el curador mueva una nota a `canónico/`, los enlaces siguen funcionando.
3. **Formato de nuevos enlaces:** "Ruta relativa al baúl" o "Ruta más corta"; cualquiera de las dos funciona con el MCP.

En Ajustes → Plugins principales → Plantillas: carpeta de plantillas `Org/_plantillas` (después del paso 3).

## 2. Plugin de sincronización (4 min)

El plugin **Team Relay** no está en el catálogo de Obsidian todavía; se instala a mano.

1. Descarga `main.js`, `manifest.json` y `styles.css` del [último release](https://github.com/entire-vc/evc-team-relay-plugin/releases/latest).
2. Cópialos en `<tu baúl>/.obsidian/plugins/team-relay/` (crea la carpeta).
3. Reinicia Obsidian → Ajustes → Plugins de la comunidad → activar **Team Relay**.
4. Ajustes del plugin → **Add server** → URL del control plane que te da el curador (piloto en LAN: `http://192.168.1.87:8000`; producción: `https://cp.org.latinovation.com`). Inicia sesión con el usuario y contraseña que te creó el curador.
5. Espera la invitación al share `Org` y acéptala desde el plugin. La carpeta `Org/` aparece en la raíz de tu baúl con `CLAUDE.md` y `canónico/`.

Si el relay todavía no está desplegado, salta al paso 3: el instalador copia la plantilla de `Org/` y podrás usar el MCP en local. Cuando el relay esté listo, vuelves aquí.

## 3. Registrar el MCP en Claude Code (4 min)

Clona el repositorio y ejecuta el instalador:

```bash
git clone <url-del-repo> latinovation-org-vault
cd latinovation-org-vault
./scripts/install-mcp.sh
```

En Windows (PowerShell):

```powershell
.\scripts\install-mcp.ps1
```

El instalador pregunta:

- **Ruta del baúl:** la carpeta raíz de tu baúl de Obsidian (por ejemplo `/Users/ana/Obsidian/MiBaul`). Detecta los baúles abiertos en Obsidian y propone el primero.
- **Tu slug de persona:** minúsculas, sin acentos (`ana`, `carlos-m`). Debe coincidir con tu carpeta en `Org/aportes/`.

Después:

1. Crea `~/.org-vault/config.json` con esos valores.
2. Si `Org/` no existe en tu baúl, ofrece copiar la plantilla de `vault-template/Org/`.
3. Crea `Org/aportes/<tu-slug>/` si no existe.
4. Compila el MCP y lo registra en Claude Code con `claude mcp add org-vault -s user ...`.

Opcional: `./scripts/install-mcp.sh --with-hook` instala un recordatorio que aparece al terminar una sesión de Claude Code si usaste `Org/` y no escribiste cierre.

## 4. Comprobar (2 min)

Abre Claude Code en cualquier carpeta y escribe `/mcp`. Debe aparecer `org-vault` conectado.

Luego pide:

> Busca en Org qué sabemos del cliente <nombre> y resume en tres líneas.

Claude debe llamar a `search_notes` y luego a `read_note` sobre uno o dos resultados. Si intenta listar toda la carpeta, es un error de configuración: revisa que `~/.org-vault/config.json` tenga tu ruta correcta.

## 5. Tu primera nota (2 min)

En Obsidian, dentro de `Org/aportes/<tu-slug>/`, crea una nota con la plantilla `nota-contexto` sobre un cliente que conozcas bien. Rellena `tipo`, `titulo`, `cliente`, `tags` y pon tu slug en `autor`. Menos de 500 palabras, una idea.

En menos de un segundo el MCP la indexa. Pide a Claude Code que la busque para confirmar.

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `org-vault` aparece como "failed" en `/mcp` | La ruta del baúl en `config.json` no existe o `person` está vacío | Ejecuta `node mcp-org-vault/dist/index.js --check` para ver el mensaje exacto |
| Claude no encuentra una nota recién creada | La nota está en `archivo/`, `_plantillas/` o `adjuntos/` (carpetas excluidas) o el frontmatter YAML tiene un error | Mueve la nota o corrige el frontmatter; `list_notes` muestra los avisos |
| Claude escribe pero la nota no aparece en otras máquinas | El relay no está sincronizando | Revisa el estado del plugin Team Relay en Obsidian (icono de la barra lateral) y que el share `Org` esté aceptado |
| "Ruta fuera de aportes/<persona>" | Claude intentó escribir en `canónico/` o en otra carpeta | Comportamiento esperado; pídele que escriba en tu carpeta |

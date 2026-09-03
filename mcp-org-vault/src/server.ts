import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "./context.js";
import { ToolError } from "./paths.js";
import { listNotes, listNotesInput } from "./tools/list-notes.js";
import { readNote, readNoteInput } from "./tools/read-note.js";
import { searchNotes, searchNotesInput } from "./tools/search-notes.js";
import { upsertContextNote, upsertContextNoteInput } from "./tools/upsert-context-note.js";
import { writeSessionNote, writeSessionNoteInput } from "./tools/write-session-note.js";

export const SERVER_NAME = "org-vault";
export const SERVER_VERSION = "0.1.0";
const TEMPLATES_FOLDER = "_plantillas";

const BASE_INSTRUCTIONS = `org-vault expone la carpeta Org/ compartida del equipo (baúl Obsidian sincronizado).
Reglas: (1) busca con search_notes antes de leer; read_note solo para resultados relevantes, con \`section\` si basta una parte.
(2) Nunca listes ni leas Org/ completo. (3) Prioriza canónico/ (estado: validado) sobre aportes/.
(4) Al terminar una tarea con resultado reutilizable, escribe un cierre con write_session_note.
(5) Contexto nuevo va a aportes/<persona>/ con upsert_context_note; nunca a canónico/ ni a carpetas de otras personas.`;

function json(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function toolError(err: unknown): CallToolResult {
  const message = err instanceof ToolError ? `${err.message}` : `Error interno: ${(err as Error).message}`;
  const code = err instanceof ToolError ? err.code : "internal_error";
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: code, message }) }] };
}

function wrap<I, O>(fn: (ctx: ToolContext, input: I) => Promise<O>, ctx: ToolContext) {
  return async (input: I): Promise<CallToolResult> => {
    try {
      return json(await fn(ctx, input));
    } catch (err) {
      return toolError(err);
    }
  };
}

/** Lee Org/CLAUDE.md si existe; su contenido viaja como instrucciones del servidor. */
export function readClaudeMd(orgPath: string): string | null {
  const file = path.join(orgPath, "CLAUDE.md");
  if (!existsSync(file)) return null;
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

export function buildInstructions(orgPath: string): string {
  const claudeMd = readClaudeMd(orgPath);
  return claudeMd ? `${BASE_INSTRUCTIONS}\n\n--- Org/CLAUDE.md ---\n${claudeMd.trim()}` : BASE_INSTRUCTIONS;
}

export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: buildInstructions(ctx.config.orgPath) },
  );

  server.registerTool(
    "search_notes",
    {
      title: "Buscar notas en Org/",
      description:
        "Búsqueda de texto completo (FTS5, sin distinguir acentos) sobre las notas de Org/. Devuelve rutas, metadatos y un fragmento. Úsala SIEMPRE antes de read_note.",
      inputSchema: searchNotesInput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    wrap(searchNotes, ctx),
  );

  server.registerTool(
    "read_note",
    {
      title: "Leer una nota de Org/",
      description: `Devuelve frontmatter, cuerpo y enlaces de una nota. Máximo ${ctx.config.maxNoteChars} caracteres; usa \`section\` para leer solo un bloque ##.`,
      inputSchema: readNoteInput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    wrap(readNote, ctx),
  );

  server.registerTool(
    "list_notes",
    {
      title: "Listar metadatos de notas",
      description:
        "Lista notas (solo metadatos, nunca el cuerpo) filtrando por carpeta, tipo, cliente, autor o fecha. Máximo 50. No sirve para recorrer Org/: usa search_notes.",
      inputSchema: listNotesInput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    wrap(listNotes, ctx),
  );

  server.registerTool(
    "write_session_note",
    {
      title: "Escribir cierre de sesión",
      description: `Crea la nota de cierre en aportes/${ctx.config.person}/YYYY-MM-DD-HHmm-<slug>.md con las cuatro secciones de la convención. Máximo 1500 caracteres. Llámala al terminar una tarea cuyo resultado sirva a otra persona.`,
      inputSchema: writeSessionNoteInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    wrap(writeSessionNote, ctx),
  );

  server.registerTool(
    "upsert_context_note",
    {
      title: "Crear o actualizar nota de contexto",
      description: `Escribe una nota de contexto (cliente, proceso, decision, referencia) en aportes/${ctx.config.person}/. Valida el frontmatter y rechaza más de 500 palabras, canónico/ y carpetas de otras personas. Reemplaza el archivo completo si ya existe.`,
      inputSchema: upsertContextNoteInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    wrap(upsertContextNote, ctx),
  );

  server.registerResource(
    "claude-md",
    "orgvault://claude-md",
    { title: "Org/CLAUDE.md", description: "Contexto estable del equipo para agentes", mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: readClaudeMd(ctx.config.orgPath) ?? "" }],
    }),
  );

  const templatesDir = path.join(ctx.config.orgPath, TEMPLATES_FOLDER);
  const listTemplates = (): string[] => {
    if (!existsSync(templatesDir)) return [];
    return readdirSync(templatesDir)
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .map((f) => f.replace(/\.md$/i, ""))
      .sort();
  };

  server.registerResource(
    "plantillas",
    new ResourceTemplate("orgvault://plantillas/{nombre}", {
      list: async () => ({
        resources: listTemplates().map((nombre) => ({
          uri: `orgvault://plantillas/${encodeURIComponent(nombre)}`,
          name: nombre,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { title: "Plantillas de Org/", description: "Plantillas de _plantillas/ (nota-contexto, cierre-sesion)", mimeType: "text/markdown" },
    async (uri, variables) => {
      const raw = variables.nombre;
      const nombre = decodeURIComponent(Array.isArray(raw) ? (raw[0] ?? "") : String(raw ?? ""));
      if (!/^[\w.-]+$/u.test(nombre)) throw new Error(`Nombre de plantilla inválido: ${nombre}`);
      const file = path.join(templatesDir, `${nombre}.md`);
      if (!existsSync(file)) throw new Error(`No existe la plantilla ${nombre}. Disponibles: ${listTemplates().join(", ") || "ninguna"}`);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: readFileSync(file, "utf8") }] };
    },
  );

  return server;
}

import { readFileSync } from "node:fs";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import { normalizeFrontmatterForOutput } from "../frontmatter.js";
import { parseNote } from "../indexer/parser.js";
import { resolveNotePath, ToolError } from "../paths.js";

export const readNoteInput = {
  path: z.string().describe("Ruta relativa a Org/, tal como la devuelve search_notes (ej. canónico/clientes/msd.md)"),
  section: z
    .string()
    .optional()
    .describe("Opcional: devuelve solo el bloque bajo ese encabezado ## (sin los #). Ahorra contexto."),
};

export interface ReadNoteOutput {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
  links: string[];
  sections: string[];
  truncated: boolean;
  warnings: string[];
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export async function readNote(ctx: ToolContext, input: { path: string; section?: string }): Promise<ReadNoteOutput> {
  const resolved = resolveNotePath(ctx.config, input.path);
  let content: string;
  try {
    content = readFileSync(resolved.abs, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new ToolError(`No existe la nota ${resolved.rel}. Usa search_notes o list_notes para obtener rutas válidas.`, "not_found");
    }
    throw new ToolError(`No se pudo leer ${resolved.rel}: ${(err as Error).message}`, "io_error");
  }
  const note = parseNote(content, resolved.rel);
  const headings = note.sections.map((s) => s.heading);

  let body = note.body.trim();
  if (input.section !== undefined && input.section.trim() !== "") {
    const wanted = fold(input.section.replace(/^#+\s*/, ""));
    const found = note.sections.find((s) => fold(s.heading) === wanted) ?? note.sections.find((s) => fold(s.heading).startsWith(wanted));
    if (!found) {
      throw new ToolError(
        `La nota ${resolved.rel} no tiene una sección "${input.section}". Secciones disponibles: ${headings.length ? headings.join(" | ") : "ninguna"}`,
        "section_not_found",
      );
    }
    body = found.content;
  }

  let truncated = false;
  const max = ctx.config.maxNoteChars;
  if (body.length > max) {
    body = body.slice(0, max).trimEnd() + "\n\n[… truncado: la nota supera maxNoteChars; usa `section` para leer una parte]";
    truncated = true;
  }

  ctx.usage.log({ tool: "read_note", path: resolved.rel, query: input.section ?? null, results: null });

  return {
    path: resolved.rel,
    frontmatter: normalizeFrontmatterForOutput(note.frontmatter),
    body,
    links: note.links,
    sections: headings,
    truncated,
    warnings: note.warnings,
  };
}

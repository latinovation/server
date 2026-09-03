import { z } from "zod";
import type { ToolContext } from "../context.js";
import { DATE_RE } from "../frontmatter.js";
import { TIPOS } from "../indexer/parser.js";
import { normalizeRel, ToolError } from "../paths.js";

export const LIST_MAX = 50;
export const LIST_DEFAULT = 20;

export const listNotesInput = {
  folder: z.string().optional().describe("Carpeta relativa a Org/ (ej. canónico/clientes o aportes/ana)"),
  tipo: z.enum(TIPOS).optional(),
  cliente: z.string().optional().describe("Slug de cliente"),
  autor: z.string().optional().describe("Slug de persona autora"),
  desde: z.string().optional().describe("Solo notas actualizadas desde esta fecha (YYYY-MM-DD)"),
  limit: z.number().int().min(1).max(LIST_MAX).optional().describe(`Máximo ${LIST_MAX}; por defecto ${LIST_DEFAULT}`),
};

export interface ListNotesInput {
  folder?: string;
  tipo?: string;
  cliente?: string;
  autor?: string;
  desde?: string;
  limit?: number;
}

export interface ListNotesOutput {
  notes: { path: string; title: string; tipo: string | null; actualizado: string | null; autor: string | null; cliente: string | null }[];
  warnings: { path: string; warnings: string[] }[];
  /** Total de notas indexadas (para saber si la lista está recortada). */
  indexed: number;
}

export async function listNotes(ctx: ToolContext, input: ListNotesInput): Promise<ListNotesOutput> {
  let folder: string | undefined;
  if (input.folder !== undefined && input.folder.trim() !== "") {
    folder = normalizeRel(input.folder);
    if (folder.split("/").some((s) => s === ".." || s.startsWith("."))) {
      throw new ToolError(`folder inválido: ${input.folder}`, "path_outside_org");
    }
  }
  let desde: string | undefined;
  if (input.desde !== undefined && input.desde.trim() !== "") {
    const m = input.desde.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (!m || !DATE_RE.test(m[1]!)) throw new ToolError(`desde debe ser una fecha ISO (YYYY-MM-DD): ${input.desde}`);
    desde = m[1]!;
  }
  const limit = Math.min(input.limit ?? LIST_DEFAULT, LIST_MAX);

  const rows = ctx.index.list({
    folder,
    tipo: input.tipo,
    cliente: input.cliente?.trim() || undefined,
    autor: input.autor?.trim() || undefined,
    desde,
    limit,
  });

  ctx.usage.log({ tool: "list_notes", path: folder ?? null, query: null, results: rows.length });

  return {
    notes: rows.map((r) => ({
      path: r.path,
      title: r.title,
      tipo: r.tipo,
      actualizado: r.actualizado,
      autor: r.autor,
      cliente: r.cliente,
    })),
    warnings: rows.filter((r) => r.warnings.length > 0).map((r) => ({ path: r.path, warnings: r.warnings })),
    indexed: ctx.index.count(),
  };
}

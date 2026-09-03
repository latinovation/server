import { z } from "zod";
import type { ToolContext } from "../context.js";
import type { SearchHit } from "../indexer/db.js";
import { TIPOS } from "../indexer/parser.js";
import { buildMatchQuery } from "../indexer/query.js";
import { ToolError } from "../paths.js";

export const searchNotesInput = {
  query: z
    .string()
    .describe('Términos de búsqueda. Comillas para frases ("reporte mensual"), * para prefijos (hub*). Sin acentos o con ellos, da igual.'),
  tipo: z.enum(TIPOS).optional().describe("Filtra por tipo de nota"),
  cliente: z.string().optional().describe("Filtra por slug de cliente"),
  autor: z.string().optional().describe("Filtra por slug de persona autora"),
  soloCanonico: z.boolean().optional().describe("Solo notas de canónico/ (validadas por el curador)"),
  limit: z.number().int().min(1).max(50).optional().describe("Máximo de resultados (por defecto, maxResults de la config)"),
};

export interface SearchNotesInput {
  query: string;
  tipo?: string;
  cliente?: string;
  autor?: string;
  soloCanonico?: boolean;
  limit?: number;
}

export interface SearchNotesOutput {
  results: SearchHit[];
  total: number;
  /** "and" si todos los términos coincidieron; "or" si hubo que relajar la consulta. */
  mode: "and" | "or";
  query: string;
}

export async function searchNotes(ctx: ToolContext, input: SearchNotesInput): Promise<SearchNotesOutput> {
  const query = (input.query ?? "").trim();
  if (!query) throw new ToolError("query no puede estar vacía", "empty_query");
  const limit = Math.min(input.limit ?? ctx.config.maxResults, 50);

  const andQuery = buildMatchQuery(query, "and");
  if (!andQuery) throw new ToolError(`query no contiene términos buscables: "${query}"`, "empty_query");

  const filters = {
    tipo: input.tipo,
    cliente: input.cliente?.trim() || undefined,
    autor: input.autor?.trim() || undefined,
    soloCanonico: input.soloCanonico,
    limit,
  };

  let mode: "and" | "or" = "and";
  let found = runSearch(ctx, andQuery, filters);
  if (found.total === 0) {
    const orQuery = buildMatchQuery(query, "or");
    if (orQuery && orQuery !== andQuery) {
      const relaxed = runSearch(ctx, orQuery, filters);
      if (relaxed.total > 0) {
        found = relaxed;
        mode = "or";
      }
    }
  }

  ctx.usage.log({ tool: "search_notes", path: null, query, results: found.total });
  return { results: found.hits, total: found.total, mode, query };
}

function runSearch(
  ctx: ToolContext,
  match: string,
  filters: { tipo?: string; cliente?: string; autor?: string; soloCanonico?: boolean; limit: number },
): { hits: SearchHit[]; total: number } {
  try {
    return ctx.index.search({ match, ...filters });
  } catch (err) {
    throw new ToolError(`Consulta FTS inválida (${match}): ${(err as Error).message}`, "bad_query");
  }
}

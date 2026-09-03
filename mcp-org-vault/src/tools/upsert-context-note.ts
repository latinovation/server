import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import { formatDate, frontmatterSchema, toYamlFrontmatter } from "../frontmatter.js";
import { countWords } from "../indexer/parser.js";
import { assertWritable, resolveNotePath, ToolError } from "../paths.js";

/** Máximo de palabras del cuerpo de una nota de contexto (docs/convenciones.md §2). */
export const CONTEXT_NOTE_MAX_WORDS = 500;

export const upsertContextNoteInput = {
  path: z
    .string()
    .describe("Ruta relativa a Org/ dentro de aportes/<tu-persona>/ (ej. aportes/ana/msd-contexto.md)"),
  frontmatter: z
    .record(z.unknown())
    .describe("Frontmatter: tipo, titulo, cliente?, tags, actualizado?, fuente?, estado (solo borrador)"),
  body: z.string().describe(`Cuerpo en Markdown, una idea, máximo ${CONTEXT_NOTE_MAX_WORDS} palabras`),
};

export interface UpsertContextNoteInput {
  path: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface UpsertContextNoteOutput {
  path: string;
  created: boolean;
  words: number;
}

export async function upsertContextNote(ctx: ToolContext, input: UpsertContextNoteInput): Promise<UpsertContextNoteOutput> {
  const resolved = resolveNotePath(ctx.config, input.path);
  assertWritable(ctx.config, resolved);

  const parsed = frontmatterSchema.safeParse(input.frontmatter ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "frontmatter"}: ${i.message}`).join("; ");
    throw new ToolError(`frontmatter inválido: ${issues}`, "invalid_frontmatter");
  }
  const fm = parsed.data;
  if (fm.autor !== undefined && fm.autor !== ctx.config.person) {
    throw new ToolError(`autor debe ser tu slug (${ctx.config.person}); recibido: ${fm.autor}`, "invalid_frontmatter");
  }
  if (fm.estado === "validado") {
    throw new ToolError("estado: validado solo lo pone el curador en canónico/. Usa estado: borrador.", "invalid_frontmatter");
  }
  if (fm.tipo === "cierre") {
    throw new ToolError("Para cierres de sesión usa write_session_note.", "invalid_frontmatter");
  }
  for (const [k, v] of Object.entries(fm)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      throw new ToolError(`frontmatter.${k} debe ser un valor simple o una lista`, "invalid_frontmatter");
    }
  }

  const body = (input.body ?? "").trim();
  if (!body) throw new ToolError("body no puede estar vacío");
  const words = countWords(body);
  if (words > CONTEXT_NOTE_MAX_WORDS) {
    throw new ToolError(
      `El cuerpo tiene ${words} palabras y el máximo es ${CONTEXT_NOTE_MAX_WORDS}. Divide en varias notas: una idea por nota.`,
      "too_long",
    );
  }

  const { tipo, titulo, cliente, tags, autor: _autor, actualizado, fuente, estado, ...extra } = fm;
  const ordered: Record<string, unknown> = {
    tipo,
    titulo,
    cliente,
    tags,
    autor: ctx.config.person,
    actualizado: actualizado ?? formatDate(ctx.now()),
    fuente,
    estado,
    ...extra,
  };

  const created = !existsSync(resolved.abs);
  mkdirSync(path.dirname(resolved.abs), { recursive: true });
  writeFileSync(resolved.abs, `${toYamlFrontmatter(ordered)}\n\n${body}\n`, "utf8");
  ctx.scanner.indexFile(resolved.rel);
  ctx.usage.log({ tool: "upsert_context_note", path: resolved.rel, query: null, results: null });
  return { path: resolved.rel, created, words };
}

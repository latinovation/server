import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import { formatDate, formatStamp, SLUG_RE, slugify, toYamlFrontmatter } from "../frontmatter.js";
import { personFolder, ToolError } from "../paths.js";

/** Límite de caracteres del cuerpo de un cierre (docs/convenciones.md §3). */
export const SESSION_NOTE_MAX_CHARS = 1500;

export const writeSessionNoteInput = {
  slug: z.string().describe("Identificador corto de la tarea, en minúsculas (ej. propuesta-pauta-q4-msd)"),
  titulo: z.string().optional().describe("Título legible. Si falta, se deriva del slug."),
  hizo: z.string().describe("Qué se hizo: el resultado, en una o dos líneas"),
  aprendio: z.string().describe('Qué se aprendió que otra persona debería saber. Si nada, "Nada nuevo".'),
  pendiente: z.string().optional().describe("Qué queda pendiente y quién lo tiene"),
  consultadas: z.array(z.string()).optional().describe("Rutas de notas de Org/ que sirvieron (las de read_note)"),
  cliente: z.string().optional().describe("Slug del cliente, si aplica"),
  tags: z.array(z.string()).max(10).optional(),
};

export interface WriteSessionNoteInput {
  slug: string;
  titulo?: string;
  hizo: string;
  aprendio: string;
  pendiente?: string;
  consultadas?: string[];
  cliente?: string;
  tags?: string[];
}

export interface WriteSessionNoteOutput {
  path: string;
  chars: number;
}

function oneLine(s: string): string {
  return s.replace(/\s*\n\s*/g, " ").trim();
}

/** Cuerpo del cierre: cuatro secciones fijas. Misma estructura que _plantillas/cierre-sesion.md. */
export function renderSessionBody(input: WriteSessionNoteInput): string {
  const consultadas = (input.consultadas ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `- [[${p.replace(/\.md$/i, "")}]]`);
  return [
    "## Qué se hizo",
    oneLine(input.hizo),
    "",
    "## Qué se aprendió",
    oneLine(input.aprendio) || "Nada nuevo",
    "",
    "## Qué queda pendiente",
    oneLine(input.pendiente ?? "") || "Nada",
    "",
    "## Notas de Org/ consultadas",
    consultadas.length ? consultadas.join("\n") : "Ninguna",
    "",
  ].join("\n");
}

export async function writeSessionNote(ctx: ToolContext, input: WriteSessionNoteInput): Promise<WriteSessionNoteOutput> {
  const slug = slugify(input.slug ?? "");
  if (!slug) throw new ToolError(`slug inválido: "${input.slug}". Usa letras, números y guiones.`);
  if (!oneLine(input.hizo ?? "")) throw new ToolError("hizo es obligatorio");
  if (!oneLine(input.aprendio ?? "")) throw new ToolError("aprendio es obligatorio (puede ser \"Nada nuevo\")");

  const cliente = input.cliente?.trim() ? slugify(input.cliente) : undefined;
  if (input.cliente?.trim() && !SLUG_RE.test(cliente!)) throw new ToolError(`cliente inválido: ${input.cliente}`);

  const body = renderSessionBody(input);
  if (body.length > SESSION_NOTE_MAX_CHARS) {
    throw new ToolError(
      `El cierre tiene ${body.length} caracteres y el máximo es ${SESSION_NOTE_MAX_CHARS}. Resume: el cierre es un puntero, no un informe.`,
      "too_long",
    );
  }

  const now = ctx.now();
  const titulo = input.titulo?.trim() || `Cierre: ${slug.replace(/-/g, " ")}`;
  const tags = Array.from(new Set((input.tags ?? []).map((t) => slugify(t)).filter(Boolean))).slice(0, 10);
  const frontmatter = toYamlFrontmatter({
    tipo: "cierre",
    titulo,
    cliente,
    tags,
    autor: ctx.config.person,
    actualizado: formatDate(now),
    fuente: "claude-code",
    estado: "borrador",
  });

  const dirRel = personFolder(ctx.config);
  const dirAbs = path.join(ctx.config.orgPath, dirRel);
  mkdirSync(dirAbs, { recursive: true });

  const base = `${formatStamp(now)}-${slug}`;
  let fileName = `${base}.md`;
  for (let i = 2; existsSync(path.join(dirAbs, fileName)); i++) fileName = `${base}-${i}.md`;
  const rel = `${dirRel}/${fileName}`;

  writeFileSync(path.join(dirAbs, fileName), `${frontmatter}\n\n${body}`, "utf8");
  ctx.scanner.indexFile(rel);
  ctx.usage.log({ tool: "write_session_note", path: rel, query: null, results: null });
  return { path: rel, chars: body.length };
}

import { z } from "zod";
import { ESTADOS, FUENTES, TIPOS } from "./indexer/parser.js";

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Esquema del frontmatter obligatorio (docs/convenciones.md §2). */
export const frontmatterSchema = z
  .object({
    tipo: z.enum(TIPOS),
    titulo: z.string().trim().min(1).max(120),
    cliente: z.string().trim().regex(SLUG_RE, "cliente debe ser un slug en minúsculas sin acentos").optional(),
    tags: z.array(z.string().trim().min(1)).max(10).default([]),
    autor: z.string().trim().regex(SLUG_RE).optional(),
    actualizado: z.string().regex(DATE_RE, "actualizado debe ser YYYY-MM-DD").optional(),
    fuente: z.enum(FUENTES).default("claude-code"),
    estado: z.enum(ESTADOS).default("borrador"),
  })
  .passthrough();

export type Frontmatter = z.infer<typeof frontmatterSchema>;

/** Convierte un texto a slug: minúsculas, sin acentos, solo [a-z0-9-]. */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatStamp(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)}-${hh}${mm}`;
}

function yamlScalar(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const s = String(value);
  // Fechas y slugs simples van sin comillas; el resto, entre comillas dobles con escape JSON.
  if (/^[a-z0-9][a-z0-9-]*$/.test(s) || DATE_RE.test(s)) return s;
  return JSON.stringify(s);
}

/**
 * Serializa un frontmatter plano a YAML legible (claves en el orden dado, arrays inline).
 * Solo admite escalares y arrays de escalares; los valores null/undefined se omiten.
 */
export function toYamlFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(yamlScalar).join(", ")}]`);
    } else if (typeof value === "object") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${yamlScalar(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

/** Deja el frontmatter listo para JSON: fechas → YYYY-MM-DD. */
export function normalizeFrontmatterForOutput(fm: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) {
    out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
  }
  return out;
}

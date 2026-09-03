import { createHash } from "node:crypto";
import matter from "gray-matter";

export const TIPOS = ["cliente", "proceso", "decision", "cierre", "referencia"] as const;
export const FUENTES = ["humano", "claude-code", "chatgpt", "grok", "otro"] as const;
export const ESTADOS = ["borrador", "validado"] as const;
export type Tipo = (typeof TIPOS)[number];

export interface Section {
  /** Texto del encabezado sin los `#`. */
  heading: string;
  level: number;
  /** Contenido bajo el encabezado, sin incluirlo, hasta el siguiente encabezado de nivel igual o superior. */
  content: string;
}

export interface ParsedNote {
  /** Frontmatter tal como quedó tras el parseo (puede estar vacío). */
  frontmatter: Record<string, unknown>;
  /** Cuerpo sin frontmatter. */
  body: string;
  title: string;
  tipo: Tipo | null;
  cliente: string | null;
  autor: string | null;
  estado: string | null;
  tags: string[];
  /** Fecha ISO (YYYY-MM-DD) o null. */
  actualizado: string | null;
  fuente: string | null;
  sections: Section[];
  /** Destinos de wikilinks `[[destino]]` (sin alias ni encabezado, sin duplicados; excluye embeds `![[...]]`). */
  links: string[];
  warnings: string[];
  hash: string;
  wordCount: number;
}

export function hashContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

function toDateString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1]! : null;
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function toTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((s) => s.replace(/^#/, "").trim())
      .filter(Boolean);
  }
  return [];
}

export function extractSections(body: string): Section[] {
  const lines = body.split(/\r?\n/);
  const sections: Section[] = [];
  let current: { heading: string; level: number; lines: string[] } | null = null;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence ? line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (m) {
      if (current) sections.push({ heading: current.heading, level: current.level, content: current.lines.join("\n").trim() });
      current = { heading: m[2]!.trim(), level: m[1]!.length, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, level: current.level, content: current.lines.join("\n").trim() });

  // El contenido de una sección termina donde empieza el siguiente encabezado de nivel igual o superior.
  // Como acumulamos hasta el siguiente encabezado de cualquier nivel, reconstruimos incluyendo subsecciones.
  const result: Section[] = [];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!;
    const parts = [s.content];
    for (let j = i + 1; j < sections.length; j++) {
      const sub = sections[j]!;
      if (sub.level <= s.level) break;
      parts.push(`${"#".repeat(sub.level)} ${sub.heading}`);
      if (sub.content) parts.push(sub.content);
    }
    result.push({ heading: s.heading, level: s.level, content: parts.filter((p) => p !== "").join("\n\n").trim() });
  }
  return result;
}

export function extractWikilinks(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /(!?)\[\[([^\]]+?)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1] === "!") continue; // embed
    let target = m[2]!;
    target = target.split("|")[0]!;
    target = target.split("#")[0]!;
    target = target.trim();
    if (!target || seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out;
}

export function countWords(text: string): number {
  const cleaned = text.replace(/```[\s\S]*?```/g, " ").trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

function firstHeading(body: string): string | null {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1]!.trim() : null;
}

export function fileNameToTitle(relPath: string): string {
  const base = relPath.split("/").pop()!.replace(/\.md$/i, "");
  return base.replace(/^\d{4}-\d{2}-\d{2}-\d{4}-/, "").replace(/[-_]+/g, " ").trim() || base;
}

/**
 * Parsea una nota Markdown con frontmatter YAML. Nunca lanza: las notas malformadas
 * se devuelven con tipo null y avisos en `warnings`.
 */
export function parseNote(content: string, relPath: string): ParsedNote {
  const warnings: string[] = [];
  let frontmatter: Record<string, unknown> = {};
  let body = content;
  const hasFrontmatter = /^﻿?---\r?\n/.test(content);

  if (hasFrontmatter) {
    try {
      const parsed = matter(content);
      const data: unknown = parsed.data;
      frontmatter = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
      body = parsed.content.replace(/^(\r?\n)+/, "");
    } catch (err) {
      warnings.push(`frontmatter-invalido: ${(err as Error).message.split("\n")[0]}`);
      frontmatter = {};
      // Quitamos el bloque --- ... --- aunque sea inválido para no indexarlo como cuerpo.
      const end = content.indexOf("\n---", 3);
      body = end >= 0 ? content.slice(content.indexOf("\n", end + 1) + 1) : content;
    }
  } else {
    warnings.push("sin-frontmatter");
  }

  const rawTipo = toStringOrNull(frontmatter.tipo);
  let tipo: Tipo | null = null;
  if (rawTipo === null) {
    if (hasFrontmatter && warnings.length === 0) warnings.push("sin-tipo");
  } else if ((TIPOS as readonly string[]).includes(rawTipo)) {
    tipo = rawTipo as Tipo;
  } else {
    warnings.push(`tipo-invalido: ${rawTipo}`);
  }

  const titleFm = toStringOrNull(frontmatter.titulo) ?? toStringOrNull(frontmatter.title);
  const title = titleFm ?? firstHeading(body) ?? fileNameToTitle(relPath);
  if (!titleFm && hasFrontmatter && !warnings.includes("frontmatter-invalido")) warnings.push("sin-titulo");

  const actualizado = toDateString(frontmatter.actualizado);
  if (hasFrontmatter && frontmatter.actualizado !== undefined && actualizado === null) {
    warnings.push("actualizado-invalido");
  }

  const estado = toStringOrNull(frontmatter.estado);
  if (estado !== null && !(ESTADOS as readonly string[]).includes(estado)) warnings.push(`estado-invalido: ${estado}`);

  const fuente = toStringOrNull(frontmatter.fuente);
  const wordCount = countWords(body);
  if (wordCount > 500) warnings.push(`cuerpo-largo: ${wordCount} palabras`);

  return {
    frontmatter,
    body,
    title,
    tipo,
    cliente: toStringOrNull(frontmatter.cliente),
    autor: toStringOrNull(frontmatter.autor),
    estado,
    tags: toTags(frontmatter.tags),
    actualizado,
    fuente,
    sections: extractSections(body),
    links: extractWikilinks(body),
    warnings,
    hash: hashContent(content),
    wordCount,
  };
}

import path from "node:path";
import { APORTES_FOLDER, CANONICAL_FOLDER, type Config } from "./config.js";

export class ToolError extends Error {
  constructor(
    message: string,
    public readonly code: string = "invalid_input",
  ) {
    super(message);
  }
}

export interface ResolvedPath {
  /** Ruta relativa a Org/, normalizada (NFC, separador `/`). */
  rel: string;
  /** Ruta absoluta en disco. */
  abs: string;
  /** Primer segmento de la ruta relativa (carpeta de nivel 1). */
  folder: string;
}

/** Normaliza una ruta relativa a Org/: NFC, separadores `/`, sin `./` inicial ni `/` final. */
export function normalizeRel(rel: string): string {
  let r = rel.normalize("NFC").replace(/\\/g, "/").trim();
  r = r.replace(/^(\.\/)+/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  r = r.replace(/\/{2,}/g, "/");
  return r;
}

export function folderOf(rel: string): string {
  const i = rel.indexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

/**
 * Valida una ruta de nota relativa a Org/ y la resuelve a disco.
 * Rechaza rutas absolutas, `..`, rutas fuera de Org/ y archivos que no sean `.md`.
 */
export function resolveNotePath(config: Config, input: string, opts: { requireMd?: boolean } = {}): ResolvedPath {
  if (typeof input !== "string" || input.trim() === "") {
    throw new ToolError("path es obligatorio (ruta relativa a Org/, por ejemplo canónico/clientes/msd.md)");
  }
  const rel = normalizeRel(input);
  if (rel === "" || path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) {
    throw new ToolError(`path debe ser relativo a Org/: ${input}`, "path_outside_org");
  }
  const segments = rel.split("/");
  if (segments.some((s) => s === "..")) {
    throw new ToolError(`path no puede salir de Org/: ${input}`, "path_outside_org");
  }
  if (segments.some((s) => s.startsWith(".") && s !== ".")) {
    throw new ToolError(`path no puede apuntar a archivos o carpetas ocultas: ${input}`, "path_outside_org");
  }
  if (opts.requireMd !== false && !rel.toLowerCase().endsWith(".md")) {
    throw new ToolError(`Solo se pueden leer o escribir notas .md: ${input}`, "not_markdown");
  }
  const abs = path.resolve(config.orgPath, rel);
  const relFromOrg = path.relative(config.orgPath, abs);
  if (relFromOrg === "" || relFromOrg.startsWith("..") || path.isAbsolute(relFromOrg)) {
    throw new ToolError(`path fuera de Org/: ${input}`, "path_outside_org");
  }
  return { rel, abs, folder: folderOf(rel) };
}

/** Carpeta propia de la persona: aportes/<person>. */
export function personFolder(config: Config): string {
  return `${APORTES_FOLDER}/${config.person}`;
}

/** Exige que la ruta esté bajo aportes/<person>/. Rechaza canónico/ y carpetas de otras personas. */
export function assertWritable(config: Config, resolved: ResolvedPath): void {
  const own = personFolder(config) + "/";
  if (resolved.rel.startsWith(own)) return;
  if (resolved.folder === CANONICAL_FOLDER) {
    throw new ToolError(
      `No se puede escribir en ${CANONICAL_FOLDER}/: solo el curador edita esa carpeta. Escribe en ${own}`,
      "forbidden_folder",
    );
  }
  if (resolved.folder === APORTES_FOLDER) {
    throw new ToolError(
      `No se puede escribir en la carpeta de otra persona (${resolved.rel}). Tu carpeta es ${own}`,
      "forbidden_folder",
    );
  }
  throw new ToolError(`Solo se puede escribir dentro de ${own} (ruta recibida: ${resolved.rel})`, "forbidden_folder");
}

export function isCanonicalValidated(folder: string, estado: string | null): boolean {
  return folder === CANONICAL_FOLDER && estado === "validado";
}

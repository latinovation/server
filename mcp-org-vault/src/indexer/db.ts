import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { CANONICAL_FOLDER } from "../config.js";
import { folderOf } from "../paths.js";
import type { ParsedNote } from "./parser.js";

export interface NoteRow {
  path: string;
  title: string;
  tipo: string | null;
  cliente: string | null;
  autor: string | null;
  estado: string | null;
  tags: string[];
  actualizado: string | null;
  mtime: number;
  size: number;
  hash: string;
  folder: string;
  warnings: string[];
}

export interface SearchOptions {
  /** Expresión FTS5 ya construida (ver query.ts). */
  match: string;
  tipo?: string;
  cliente?: string;
  autor?: string;
  soloCanonico?: boolean;
  limit: number;
}

export interface SearchHit {
  path: string;
  title: string;
  tipo: string | null;
  cliente: string | null;
  autor: string | null;
  estado: string | null;
  actualizado: string | null;
  snippet: string;
  /** Mayor es mejor (bm25 con el signo invertido, redondeado a 3 decimales). */
  score: number;
}

export interface ListOptions {
  folder?: string;
  tipo?: string;
  cliente?: string;
  autor?: string;
  desde?: string;
  limit: number;
}

interface RawRow {
  path: string;
  title: string;
  tipo: string | null;
  cliente: string | null;
  autor: string | null;
  estado: string | null;
  tags: string;
  actualizado: string | null;
  mtime: number;
  size: number;
  hash: string;
  folder: string;
  warnings: string;
}

const SCHEMA_VERSION = 1;

function rowToNote(r: RawRow): NoteRow {
  return { ...r, tags: JSON.parse(r.tags) as string[], warnings: JSON.parse(r.warnings) as string[] };
}

export class Fts5UnavailableError extends Error {}

/**
 * Índice local de notas: tabla `notes` (metadatos) + `notes_fts` (FTS5, unicode61 sin diacríticos).
 * Un archivo SQLite por máquina; se reconstruye desde Org/ en cualquier momento.
 */
export class NoteIndex {
  readonly db: Database.Database;
  private readonly stmts;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.assertFts5();
    this.migrate();
    this.stmts = {
      upsertNote: this.db.prepare(
        `INSERT INTO notes (path, title, tipo, cliente, autor, estado, tags, actualizado, mtime, size, hash, folder, warnings)
         VALUES (@path, @title, @tipo, @cliente, @autor, @estado, @tags, @actualizado, @mtime, @size, @hash, @folder, @warnings)
         ON CONFLICT(path) DO UPDATE SET
           title = excluded.title, tipo = excluded.tipo, cliente = excluded.cliente, autor = excluded.autor,
           estado = excluded.estado, tags = excluded.tags, actualizado = excluded.actualizado, mtime = excluded.mtime,
           size = excluded.size, hash = excluded.hash, folder = excluded.folder, warnings = excluded.warnings`,
      ),
      deleteFts: this.db.prepare(`DELETE FROM notes_fts WHERE path = ?`),
      insertFts: this.db.prepare(`INSERT INTO notes_fts (path, title, body, tags, cliente) VALUES (?, ?, ?, ?, ?)`),
      deleteNote: this.db.prepare(`DELETE FROM notes WHERE path = ?`),
      getNote: this.db.prepare(`SELECT * FROM notes WHERE path = ?`),
      hashes: this.db.prepare(`SELECT path, hash FROM notes`),
      count: this.db.prepare(`SELECT count(*) AS n FROM notes`),
    };
  }

  private assertFts5(): void {
    try {
      this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS temp.__fts5_check USING fts5(x); DROP TABLE temp.__fts5_check;`);
    } catch (err) {
      throw new Fts5UnavailableError(
        `El binario de SQLite no incluye FTS5 (${(err as Error).message}). Reinstala better-sqlite3 o usa un Node con prebuilds.`,
      );
    }
  }

  private migrate(): void {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    if (version >= SCHEMA_VERSION) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        path TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        tipo TEXT, cliente TEXT, autor TEXT, estado TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        actualizado TEXT,
        mtime INTEGER NOT NULL,
        size INTEGER NOT NULL,
        hash TEXT NOT NULL,
        folder TEXT NOT NULL DEFAULT '',
        warnings TEXT NOT NULL DEFAULT '[]'
      );
      CREATE INDEX IF NOT EXISTS notes_folder ON notes(folder);
      CREATE INDEX IF NOT EXISTS notes_tipo ON notes(tipo);
      CREATE INDEX IF NOT EXISTS notes_cliente ON notes(cliente);
      CREATE INDEX IF NOT EXISTS notes_actualizado ON notes(actualizado);
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        path UNINDEXED, title, body, tags, cliente,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }

  /** Mapa path → hash de todo lo indexado, para saltar archivos sin cambios. */
  hashes(): Map<string, string> {
    const map = new Map<string, string>();
    for (const r of this.stmts.hashes.all() as { path: string; hash: string }[]) map.set(r.path, r.hash);
    return map;
  }

  upsert(relPath: string, note: ParsedNote, stat: { mtimeMs: number; size: number }): void {
    const run = this.db.transaction(() => {
      this.stmts.upsertNote.run({
        path: relPath,
        title: note.title,
        tipo: note.tipo,
        cliente: note.cliente,
        autor: note.autor,
        estado: note.estado,
        tags: JSON.stringify(note.tags),
        actualizado: note.actualizado,
        mtime: Math.round(stat.mtimeMs),
        size: stat.size,
        hash: note.hash,
        folder: folderOf(relPath),
        warnings: JSON.stringify(note.warnings),
      });
      this.stmts.deleteFts.run(relPath);
      this.stmts.insertFts.run(relPath, note.title, note.body, note.tags.join(" "), note.cliente ?? "");
    });
    run();
  }

  remove(relPath: string): boolean {
    const run = this.db.transaction(() => {
      const info = this.stmts.deleteNote.run(relPath);
      this.stmts.deleteFts.run(relPath);
      return info.changes > 0;
    });
    return run();
  }

  /** Elimina del índice las notas cuya ruta no está en `seen`. Devuelve cuántas quitó. */
  removeMissing(seen: Set<string>): number {
    let removed = 0;
    const run = this.db.transaction(() => {
      for (const p of this.hashes().keys()) {
        if (!seen.has(p)) {
          this.remove(p);
          removed++;
        }
      }
    });
    run();
    return removed;
  }

  get(relPath: string): NoteRow | undefined {
    const r = this.stmts.getNote.get(relPath) as RawRow | undefined;
    return r ? rowToNote(r) : undefined;
  }

  count(): number {
    return (this.stmts.count.get() as { n: number }).n;
  }

  search(opts: SearchOptions): { hits: SearchHit[]; total: number } {
    const where: string[] = ["notes_fts MATCH @match"];
    const params: Record<string, unknown> = { match: opts.match, limit: opts.limit, canonical: CANONICAL_FOLDER };
    if (opts.tipo) {
      where.push("n.tipo = @tipo");
      params.tipo = opts.tipo;
    }
    if (opts.cliente) {
      where.push("n.cliente = @cliente");
      params.cliente = opts.cliente;
    }
    if (opts.autor) {
      where.push("n.autor = @autor");
      params.autor = opts.autor;
    }
    if (opts.soloCanonico) where.push("n.folder = @canonical");
    const whereSql = where.join(" AND ");

    // Pesos bm25 por columna: path (no indexada), title, body, tags, cliente.
    // Subconsulta: FTS5 expone una columna oculta `rank` y, dentro de una expresión del ORDER BY,
    // SQLite la resolvería antes que el alias con nuestros pesos.
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT n.path, n.title, n.tipo, n.cliente, n.autor, n.estado, n.actualizado,
                  bm25(notes_fts, 0, 5.0, 1.0, 3.0, 3.0) AS score_raw,
                  snippet(notes_fts, -1, '«', '»', '…', 24) AS snippet,
                  (n.folder = @canonical AND n.estado = 'validado') AS canon
           FROM notes_fts f JOIN notes n ON n.path = f.path
           WHERE ${whereSql}
         )
         ORDER BY round(score_raw, 3) ASC, canon DESC, actualizado DESC
         LIMIT @limit`,
      )
      .all(params) as (Omit<SearchHit, "score"> & { score_raw: number; canon: number })[];
    const total = (
      this.db
        .prepare(`SELECT count(*) AS n FROM notes_fts f JOIN notes n ON n.path = f.path WHERE ${whereSql}`)
        .get(params) as { n: number }
    ).n;
    const hits = rows.map(({ score_raw, canon: _canon, snippet, ...rest }) => ({
      ...rest,
      snippet: cleanSnippet(snippet),
      score: Math.round(-score_raw * 1000) / 1000 || 0,
    }));
    return { hits, total };
  }

  list(opts: ListOptions): NoteRow[] {
    const where: string[] = [];
    const params: Record<string, unknown> = { limit: opts.limit };
    if (opts.folder) {
      where.push("(n.path LIKE @folderPrefix ESCAPE '\\')");
      params.folderPrefix = opts.folder.replace(/[%_\\]/g, (c) => "\\" + c) + "/%";
    }
    if (opts.tipo) {
      where.push("n.tipo = @tipo");
      params.tipo = opts.tipo;
    }
    if (opts.cliente) {
      where.push("n.cliente = @cliente");
      params.cliente = opts.cliente;
    }
    if (opts.autor) {
      where.push("n.autor = @autor");
      params.autor = opts.autor;
    }
    if (opts.desde) {
      where.push("COALESCE(n.actualizado, date(n.mtime / 1000, 'unixepoch')) >= @desde");
      params.desde = opts.desde;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = this.db
      .prepare(
        `SELECT * FROM notes n ${whereSql}
         ORDER BY COALESCE(n.actualizado, date(n.mtime / 1000, 'unixepoch')) DESC, n.mtime DESC, n.path ASC
         LIMIT @limit`,
      )
      .all(params) as RawRow[];
    return rows.map(rowToNote);
  }

  close(): void {
    this.db.close();
  }
}

/** Colapsa espacios, elimina saltos de línea y recorta a 200 caracteres. */
export function cleanSnippet(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 200 ? flat.slice(0, 199).trimEnd() + "…" : flat;
}

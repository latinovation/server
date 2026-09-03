import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import type { Config } from "../config.js";
import { normalizeRel } from "../paths.js";
import type { NoteIndex } from "./db.js";
import { parseNote } from "./parser.js";

export interface ScanResult {
  total: number;
  indexed: number;
  skipped: number;
  removed: number;
  ms: number;
}

const DEBOUNCE_MS = 500;

/**
 * Recorre Org/ para construir el índice y lo mantiene al día con chokidar.
 * Los cambios que llegan por el relay son cambios de archivo normales: no hay integración especial.
 */
export class Scanner {
  private watcher: FSWatcher | null = null;
  private pending = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> = Promise.resolve();
  private readonly excluded: Set<string>;

  constructor(
    private readonly config: Config,
    private readonly index: NoteIndex,
    private readonly log: (msg: string) => void = (msg) => console.error(`[org-vault] ${msg}`),
  ) {
    this.excluded = new Set(config.excludeFolders.map((f) => normalizeRel(f)));
  }

  /** Ruta relativa a Org/ (NFC, `/`) o null si está fuera. */
  toRel(absPath: string): string | null {
    const rel = path.relative(this.config.orgPath, absPath);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
    return normalizeRel(rel);
  }

  /** ¿Debe indexarse esta ruta? Excluye carpetas configuradas, ocultas y archivos que no sean .md. */
  isIndexable(rel: string, isFile: boolean): boolean {
    const segments = rel.split("/");
    if (segments.some((s) => s.startsWith("."))) return false;
    if (segments.length > 0 && this.excluded.has(segments[0]!)) return false;
    // Org/CLAUDE.md viaja como instrucciones del servidor y como recurso; no se indexa.
    if (rel === "CLAUDE.md") return false;
    if (isFile && !rel.toLowerCase().endsWith(".md")) return false;
    return true;
  }

  /** Escaneo completo: indexa lo nuevo o cambiado (por hash) y elimina del índice lo que ya no existe. */
  scan(): ScanResult {
    const start = performance.now();
    const known = this.index.hashes();
    const seen = new Set<string>();
    let indexed = 0;
    let skipped = 0;

    const walk = (dir: string): void => {
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch (err) {
        this.log(`no se pudo leer ${dir}: ${(err as Error).message}`);
        return;
      }
      for (const entry of entries) {
        const abs = path.join(dir, entry.name);
        const rel = this.toRel(abs);
        if (rel === null) continue;
        if (entry.isDirectory()) {
          if (this.isIndexable(rel, false)) walk(abs);
          continue;
        }
        if (!entry.isFile() || !this.isIndexable(rel, true)) continue;
        seen.add(rel);
        const content = this.safeRead(abs);
        if (content === null) continue;
        const stat = statSync(abs);
        const note = parseNote(content, rel);
        if (known.get(rel) === note.hash) {
          skipped++;
          continue;
        }
        this.index.upsert(rel, note, stat);
        indexed++;
      }
    };

    const tx = this.index.db.transaction(() => walk(this.config.orgPath));
    tx();
    const removed = this.index.removeMissing(seen);
    return { total: seen.size, indexed, skipped, removed, ms: Math.round(performance.now() - start) };
  }

  /** Indexa (o elimina del índice) un archivo concreto. Devuelve true si quedó indexado. */
  indexFile(rel: string): boolean {
    rel = normalizeRel(rel);
    if (!this.isIndexable(rel, true)) return false;
    const abs = path.join(this.config.orgPath, rel);
    if (!existsSync(abs)) {
      this.index.remove(rel);
      return false;
    }
    const content = this.safeRead(abs);
    if (content === null) return false;
    const stat = statSync(abs);
    this.index.upsert(rel, parseNote(content, rel), stat);
    return true;
  }

  /** Arranca el watcher. Idempotente. */
  start(): void {
    if (this.watcher) return;
    this.watcher = watch(this.config.orgPath, {
      ignoreInitial: true,
      persistent: true,
      ignored: (absPath: string, stats?: { isFile(): boolean }) => {
        const rel = this.toRel(absPath);
        if (rel === null) return false;
        return !this.isIndexable(rel, stats?.isFile() ?? false);
      },
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });
    const enqueue = (absPath: string): void => {
      const rel = this.toRel(absPath);
      if (rel === null || !this.isIndexable(rel, true)) return;
      this.pending.add(rel);
      this.schedule();
    };
    this.watcher.on("add", enqueue).on("change", enqueue).on("unlink", enqueue);
    this.watcher.on("error", (err) => this.log(`watcher: ${(err as Error).message}`));
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushing = this.flushing.then(() => this.flush());
    }, DEBOUNCE_MS);
  }

  /** Procesa los cambios pendientes ahora mismo (el watcher lo llama tras el debounce; los tests directamente). */
  async flush(): Promise<void> {
    const batch = [...this.pending];
    this.pending.clear();
    for (const rel of batch) {
      try {
        this.indexFile(rel);
      } catch (err) {
        this.log(`no se pudo indexar ${rel}: ${(err as Error).message}`);
      }
    }
  }

  /** Espera a que no haya cambios pendientes ni en proceso. */
  async idle(): Promise<void> {
    while (this.timer || this.pending.size > 0) {
      await new Promise((r) => setTimeout(r, 50));
      await this.flushing;
    }
    await this.flushing;
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private safeRead(abs: string): string | null {
    try {
      return readFileSync(abs, "utf8");
    } catch (err) {
      this.log(`no se pudo leer ${abs}: ${(err as Error).message}`);
      return null;
    }
  }
}

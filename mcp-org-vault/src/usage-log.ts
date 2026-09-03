import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type UsageTool = "search_notes" | "read_note" | "list_notes" | "write_session_note" | "upsert_context_note";

export interface UsageEntry {
  ts: string;
  person: string;
  tool: UsageTool;
  path: string | null;
  query: string | null;
  results: number | null;
}

/**
 * Registro de uso en JSONL (una línea por llamada). Las escrituras son asíncronas y
 * nunca interrumpen la respuesta del tool: un fallo se reporta por stderr.
 */
export class UsageLog {
  private ready: Promise<void> | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly person: string,
    private readonly onError: (err: Error) => void = (err) => console.error(`[org-vault] usage log: ${err.message}`),
  ) {}

  log(entry: Omit<UsageEntry, "ts" | "person"> & { ts?: string }): void {
    const line: UsageEntry = {
      ts: entry.ts ?? new Date().toISOString(),
      person: this.person,
      tool: entry.tool,
      path: entry.path ?? null,
      query: entry.query ?? null,
      results: entry.results ?? null,
    };
    this.queue = this.queue
      .then(() => this.ensureDir())
      .then(() => appendFile(this.file, JSON.stringify(line) + "\n", "utf8"))
      .catch((err: Error) => this.onError(err));
  }

  /** Espera a que todas las líneas pendientes estén escritas (tests y cierre limpio). */
  flush(): Promise<void> {
    return this.queue;
  }

  private ensureDir(): Promise<void> {
    if (!this.ready) {
      this.ready = mkdir(path.dirname(this.file), { recursive: true }).then(() => undefined);
    }
    return this.ready;
  }
}

import type { Config } from "./config.js";
import type { ToolContext } from "./context.js";
import { NoteIndex } from "./indexer/db.js";
import { Scanner, type ScanResult } from "./indexer/scanner.js";
import { UsageLog } from "./usage-log.js";

export interface Runtime {
  ctx: ToolContext;
  scan: ScanResult;
  close(): Promise<void>;
}

/** Abre el índice, hace el escaneo inicial y (opcionalmente) arranca el watcher. */
export function createRuntime(config: Config, log: (msg: string) => void = (m) => console.error(`[org-vault] ${m}`)): Runtime {
  const index = new NoteIndex(config.indexDb);
  const scanner = new Scanner(config, index, log);
  const scan = scanner.scan();
  if (config.watch) scanner.start();
  const usage = new UsageLog(config.usageLog, config.person, (err) => log(`usage log: ${err.message}`));
  const ctx: ToolContext = { config, index, scanner, usage, now: () => new Date() };
  return {
    ctx,
    scan,
    async close() {
      await scanner.stop();
      await usage.flush();
      index.close();
    },
  };
}

import type { Config } from "./config.js";
import type { NoteIndex } from "./indexer/db.js";
import type { Scanner } from "./indexer/scanner.js";
import type { UsageLog } from "./usage-log.js";

/** Dependencias compartidas por todas las tools. */
export interface ToolContext {
  config: Config;
  index: NoteIndex;
  scanner: Scanner;
  usage: UsageLog;
  /** Reloj inyectable (tests). */
  now: () => Date;
}

#!/usr/bin/env node
/**
 * Hook `Stop` de Claude Code: si la sesión usó tools de org-vault y no escribió cierre,
 * pide a Claude que lo escriba (o que diga por qué no hace falta) antes de terminar.
 *
 * Entrada (stdin, JSON): { session_id, transcript_path, hook_event_name: "Stop", stop_hook_active }
 * Salida: exit 0 = dejar terminar; exit 2 + mensaje en stderr = Claude continúa con ese mensaje.
 * `stop_hook_active` es true cuando Claude ya continuó por este hook: entonces siempre dejamos terminar.
 */
import { readFileSync } from "node:fs";

const ORG_PREFIX = "mcp__org-vault__";
const WRITE_TOOL = `${ORG_PREFIX}write_session_note`;

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function toolNames(transcriptPath) {
  const names = new Set();
  let raw;
  try {
    raw = readFileSync(transcriptPath, "utf8");
  } catch {
    return names;
  }
  for (const line of raw.split("\n")) {
    if (!line.includes(ORG_PREFIX)) continue;
    try {
      const entry = JSON.parse(line);
      const content = entry?.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "tool_use" && typeof block.name === "string") names.add(block.name);
        }
      }
    } catch {
      // Línea no JSON: búsqueda textual como respaldo.
      const m = line.match(/mcp__org-vault__[a-z_]+/g);
      if (m) for (const n of m) names.add(n);
    }
  }
  return names;
}

let input = {};
try {
  input = JSON.parse(readStdin() || "{}");
} catch {
  process.exit(0);
}

if (input.stop_hook_active) process.exit(0);
if (!input.transcript_path) process.exit(0);

const used = toolNames(input.transcript_path);
const usedOrg = [...used].some((n) => n.startsWith(ORG_PREFIX));
if (!usedOrg || used.has(WRITE_TOOL)) process.exit(0);

process.stderr.write(
  "Esta sesión consultó Org/ (org-vault) pero no escribió cierre. " +
    "Si el resultado le sirve a otra persona del equipo, llama a write_session_note " +
    "(qué se hizo, qué se aprendió, qué queda pendiente, notas consultadas; máximo 10 líneas). " +
    "Si no es reutilizable, dilo en una línea y termina.\n",
);
process.exit(2);

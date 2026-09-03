/**
 * Informe de uso de org-vault: agrega ~/.org-vault/usage.jsonl por semana ISO y, si está disponible,
 * lo combina con `ccusage daily --json` (tokens de Claude Code).
 *
 * Uso: npm run report -- [--log ~/.org-vault/usage.jsonl] [--db ~/.org-vault/index.db]
 *                        [--weeks 4] [--json] [--no-ccusage]
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

interface Entry {
  ts: string;
  person: string;
  tool: string;
  path: string | null;
  query: string | null;
  results: number | null;
}

interface WeekStats {
  week: string;
  searches: number;
  emptySearches: Map<string, number>;
  reads: Map<string, { count: number; persons: Set<string> }>;
  cierres: number;
  upserts: number;
  persons: Set<string>;
  crossReadsCanonico: number;
}

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const expand = (p: string): string => (p.startsWith("~/") ? path.join(homedir(), p.slice(2)) : p);

const logFile = expand(opt("log", "~/.org-vault/usage.jsonl"));
const dbFile = expand(opt("db", "~/.org-vault/index.db"));
const weeks = Number(opt("weeks", "4"));
const asJson = args.includes("--json");
const useCcusage = !args.includes("--no-ccusage");

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function readEntries(file: string): Entry[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Entry];
      } catch {
        return [];
      }
    });
}

/** autor por ruta y lista completa de rutas, leídos del índice local si existe. */
function readIndex(file: string): { authors: Map<string, string | null>; paths: string[] } {
  const authors = new Map<string, string | null>();
  const paths: string[] = [];
  if (!existsSync(file)) return { authors, paths };
  try {
    const require = createRequire(import.meta.url);
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db = new Database(file, { readonly: true });
    for (const r of db.prepare("SELECT path, autor FROM notes").all() as { path: string; autor: string | null }[]) {
      authors.set(r.path, r.autor);
      paths.push(r.path);
    }
    db.close();
  } catch (err) {
    console.error(`(sin índice: ${(err as Error).message})`);
  }
  return { authors, paths };
}

function ccusageWeekly(since: Date): Map<string, { tokens: number; cost: number }> | null {
  if (!useCcusage) return null;
  const sinceArg = since.toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const out = execFileSync("npx", ["-y", "ccusage", "daily", "--json", "--since", sinceArg], {
      encoding: "utf8",
      timeout: 120_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const data = JSON.parse(out) as { daily?: { period: string; totalTokens: number; totalCost: number }[] };
    const byWeek = new Map<string, { tokens: number; cost: number }>();
    for (const d of data.daily ?? []) {
      const w = isoWeek(new Date(d.period + "T00:00:00Z"));
      const cur = byWeek.get(w) ?? { tokens: 0, cost: 0 };
      cur.tokens += d.totalTokens;
      cur.cost += d.totalCost;
      byWeek.set(w, cur);
    }
    return byWeek;
  } catch {
    return null;
  }
}

const entries = readEntries(logFile);
const now = new Date();
const since = new Date(now.getTime() - weeks * 7 * 86400000);
const recent = entries.filter((e) => new Date(e.ts) >= since);
const { authors, paths: indexedPaths } = readIndex(dbFile);

const byWeek = new Map<string, WeekStats>();
for (const e of recent) {
  const w = isoWeek(new Date(e.ts));
  let s = byWeek.get(w);
  if (!s) {
    s = { week: w, searches: 0, emptySearches: new Map(), reads: new Map(), cierres: 0, upserts: 0, persons: new Set(), crossReadsCanonico: 0 };
    byWeek.set(w, s);
  }
  s.persons.add(e.person);
  switch (e.tool) {
    case "search_notes":
      s.searches++;
      if (e.results === 0 && e.query) s.emptySearches.set(e.query, (s.emptySearches.get(e.query) ?? 0) + 1);
      break;
    case "read_note": {
      if (!e.path) break;
      const r = s.reads.get(e.path) ?? { count: 0, persons: new Set<string>() };
      r.count++;
      r.persons.add(e.person);
      s.reads.set(e.path, r);
      if (e.path.startsWith("canónico/") && authors.get(e.path) && authors.get(e.path) !== e.person) s.crossReadsCanonico++;
      break;
    }
    case "write_session_note":
      s.cierres++;
      break;
    case "upsert_context_note":
      s.upserts++;
      break;
  }
}

// Notas sin ninguna lectura en 90 días: candidatas a archivo/.
const ninety = new Date(now.getTime() - 90 * 86400000);
const readRecently = new Set(entries.filter((e) => e.tool === "read_note" && new Date(e.ts) >= ninety).map((e) => e.path));
const staleCandidates = indexedPaths.filter((p) => !readRecently.has(p) && !p.startsWith("aportes/") ? true : false);

const tokens = ccusageWeekly(since);
const weeksSorted = [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week));

if (asJson) {
  const out = weeksSorted.map((s) => ({
    week: s.week,
    persons: [...s.persons],
    searches: s.searches,
    emptySearches: [...s.emptySearches.entries()].map(([query, count]) => ({ query, count })),
    topReads: [...s.reads.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([p, r]) => ({ path: p, count: r.count, persons: [...r.persons] })),
    crossReadsCanonico: s.crossReadsCanonico,
    cierres: s.cierres,
    upserts: s.upserts,
    claudeCode: tokens?.get(s.week) ?? null,
  }));
  console.log(JSON.stringify({ since: since.toISOString(), weeks: out, staleCandidates }, null, 2));
  process.exit(0);
}

console.log(`# Informe de uso de org-vault · últimas ${weeks} semanas\n`);
console.log(`Registro: ${logFile} (${entries.length} líneas, ${recent.length} en el periodo)`);
console.log(`Índice: ${existsSync(dbFile) ? `${dbFile} (${indexedPaths.length} notas)` : "no encontrado"}`);
console.log(`ccusage: ${tokens ? "disponible" : useCcusage ? "no disponible" : "desactivado"}\n`);

if (weeksSorted.length === 0) console.log("Sin actividad en el periodo.\n");

for (const s of weeksSorted) {
  console.log(`## ${s.week} · ${s.persons.size} persona(s): ${[...s.persons].join(", ")}\n`);
  console.log(`| Métrica | Valor |\n|---|---|`);
  console.log(`| Búsquedas | ${s.searches} |`);
  console.log(`| Búsquedas sin resultado | ${[...s.emptySearches.values()].reduce((a, b) => a + b, 0)} |`);
  console.log(`| Lecturas | ${[...s.reads.values()].reduce((a, r) => a + r.count, 0)} |`);
  console.log(`| Lecturas de canónico/ por personas distintas al autor | ${s.crossReadsCanonico} |`);
  console.log(`| Cierres escritos | ${s.cierres} |`);
  console.log(`| Notas de contexto escritas | ${s.upserts} |`);
  const t = tokens?.get(s.week);
  if (t) console.log(`| Tokens Claude Code (ccusage) | ${t.tokens.toLocaleString("es")} (~$${t.cost.toFixed(2)}) |`);
  console.log();

  const top = [...s.reads.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  if (top.length) {
    console.log(`**Notas más leídas**\n`);
    for (const [p, r] of top) console.log(`- ${p} · ${r.count} lectura(s) · ${[...r.persons].join(", ")}`);
    console.log();
  }
  const empty = [...s.emptySearches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (empty.length) {
    console.log(`**Consultas sin resultado (candidatas a documentar)**\n`);
    for (const [q, c] of empty) console.log(`- "${q}" · ${c} vez/veces`);
    console.log();
  }
}

if (staleCandidates.length) {
  console.log(`## Sin lecturas en 90 días (candidatas a archivo/, fuera de aportes/)\n`);
  for (const p of staleCandidates.slice(0, 30)) console.log(`- ${p}`);
  if (staleCandidates.length > 30) console.log(`- … y ${staleCandidates.length - 30} más`);
  console.log();
}

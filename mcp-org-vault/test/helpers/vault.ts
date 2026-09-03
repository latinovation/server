import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildConfig, type Config } from "../../src/config.js";
import type { ToolContext } from "../../src/context.js";
import { toYamlFrontmatter } from "../../src/frontmatter.js";
import { NoteIndex } from "../../src/indexer/db.js";
import { Scanner } from "../../src/indexer/scanner.js";
import { UsageLog, type UsageEntry } from "../../src/usage-log.js";

export function note(fm: Record<string, unknown>, body: string): string {
  return `${toYamlFrontmatter(fm)}\n\n${body.trim()}\n`;
}

/** Notas base que cubren canónico/, aportes/, carpetas excluidas y notas malformadas. */
export const FIXTURE_NOTES: Record<string, string> = {
  "CLAUDE.md": "# Latinovation\n\nReglas para agentes: buscar antes de leer.\n",
  "canónico/clientes/msd.md": note(
    {
      tipo: "cliente",
      titulo: "MSD: contexto de cuenta",
      cliente: "msd",
      tags: ["farma", "hubspot"],
      autor: "ana",
      actualizado: "2026-08-20",
      fuente: "humano",
      estado: "validado",
    },
    `## Contexto
MSD es cliente farmacéutico desde 2024. Usa HubSpot como CRM y pide reportes mensuales de pauta.

## Contactos
Laura Pérez (marketing), Jorge Ruiz (compras). Ver [[canónico/procesos/reporte-mensual]].

## Herramientas
HubSpot Marketing Hub, Google Ads, Meta Ads. Reportes en Looker Studio.`,
  ),
  "canónico/procesos/reporte-mensual.md": note(
    {
      tipo: "proceso",
      titulo: "Cómo armamos el reporte mensual de pauta",
      tags: ["reportes", "looker"],
      autor: "carlos-m",
      actualizado: "2026-07-01",
      fuente: "humano",
      estado: "validado",
    },
    `## Pasos
1. Exportar datos de HubSpot y Google Ads.
2. Actualizar el dashboard de Looker Studio.
3. Revisar con el account manager antes del día 5.`,
  ),
  "canónico/decisiones/looker-vs-datastudio.md": note(
    {
      tipo: "decision",
      titulo: "Usar Looker Studio para todos los reportes",
      tags: ["reportes"],
      autor: "ana",
      actualizado: "2026-05-10",
      fuente: "humano",
      estado: "validado",
    },
    "Se decidió estandarizar en Looker Studio por costo cero y conectores nativos.",
  ),
  "aportes/ana/msd-hubspot-integracion.md": note(
    {
      tipo: "cliente",
      titulo: "MSD: integración HubSpot con formularios web",
      cliente: "msd",
      tags: ["hubspot", "formularios"],
      autor: "ana",
      actualizado: "2026-09-01",
      fuente: "claude-code",
      estado: "borrador",
    },
    `## Contexto
Los formularios de la web de MSD envían leads a HubSpot vía API. El token vive en el gestor de contraseñas.

## Pendiente
Validar con Laura si el workflow de nurturing sigue activo.`,
  ),
  "aportes/ana/glosario-pauta.md": note(
    {
      tipo: "referencia",
      titulo: "Glosario de pauta",
      tags: ["glosario"],
      autor: "ana",
      actualizado: "2026-06-15",
      fuente: "humano",
      estado: "borrador",
    },
    "CPM, CPC, CPA, ROAS: definiciones cortas para onboarding de nuevas personas.",
  ),
  "aportes/carlos-m/sin-frontmatter.md": "# Nota suelta\n\nEsta nota no tiene frontmatter pero habla de Meta Ads y de canónico.\n",
  "aportes/carlos-m/tipo-raro.md": note(
    { tipo: "cosa", titulo: "Tipo inválido", autor: "carlos-m", actualizado: "2026-08-01", fuente: "humano", estado: "borrador" },
    "Cuerpo con tipo inválido.",
  ),
  "archivo/vieja.md": note(
    { tipo: "cliente", titulo: "MSD HubSpot archivo", cliente: "msd", autor: "ana", actualizado: "2025-01-01", fuente: "humano", estado: "borrador" },
    "Nota archivada que menciona MSD y HubSpot pero no debe indexarse.",
  ),
  "_plantillas/nota-contexto.md": "---\ntipo: cliente\ntitulo: \"{{title}}\"\n---\n\nPlantilla MSD HubSpot.\n",
  ".obsidian/workspace.md": "MSD HubSpot oculto\n",
};

export interface TestVault {
  root: string;
  orgPath: string;
  config: Config;
  ctx: ToolContext;
  index: NoteIndex;
  scanner: Scanner;
  usageFile: string;
  write(rel: string, content: string): void;
  read(rel: string): string;
  exists(rel: string): boolean;
  remove(rel: string): void;
  usageLines(): Promise<UsageEntry[]>;
  cleanup(): Promise<void>;
}

export interface TestVaultOptions {
  person?: string;
  notes?: Record<string, string>;
  /** Si es false, no se crean las FIXTURE_NOTES. */
  fixtures?: boolean;
  watch?: boolean;
  now?: Date;
  maxNoteChars?: number;
  maxResults?: number;
}

export function createTestVault(opts: TestVaultOptions = {}): TestVault {
  const root = mkdtempSync(path.join(tmpdir(), "org-vault-test-"));
  const orgPath = path.join(root, "Org");
  mkdirSync(orgPath, { recursive: true });
  const notes = { ...(opts.fixtures === false ? {} : FIXTURE_NOTES), ...(opts.notes ?? {}) };
  for (const [rel, content] of Object.entries(notes)) {
    const abs = path.join(orgPath, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  // Un adjunto binario para comprobar que se ignora.
  mkdirSync(path.join(orgPath, "adjuntos"), { recursive: true });
  writeFileSync(path.join(orgPath, "adjuntos", "foto.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const usageFile = path.join(root, "usage.jsonl");
  const config = buildConfig({
    vaultPath: root,
    person: opts.person ?? "ana",
    indexDb: path.join(root, "index.db"),
    usageLog: usageFile,
    watch: opts.watch ?? false,
    maxNoteChars: opts.maxNoteChars ?? 6000,
    maxResults: opts.maxResults ?? 8,
  });
  const index = new NoteIndex(config.indexDb);
  const scanner = new Scanner(config, index, () => undefined);
  scanner.scan();
  if (config.watch) scanner.start();
  const usage = new UsageLog(usageFile, config.person, () => undefined);
  const now = opts.now ?? new Date(2026, 8, 3, 14, 2, 11);
  const ctx: ToolContext = { config, index, scanner, usage, now: () => now };

  return {
    root,
    orgPath,
    config,
    ctx,
    index,
    scanner,
    usageFile,
    write(rel, content) {
      const abs = path.join(orgPath, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
    },
    read(rel) {
      return readFileSync(path.join(orgPath, rel), "utf8");
    },
    exists(rel) {
      return existsSync(path.join(orgPath, rel));
    },
    remove(rel) {
      unlinkSync(path.join(orgPath, rel));
    },
    async usageLines() {
      await usage.flush();
      if (!existsSync(usageFile)) return [];
      return readFileSync(usageFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as UsageEntry);
    },
    async cleanup() {
      await scanner.stop();
      await usage.flush();
      index.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const CLIENTS = ["msd", "bayer", "nestle", "bimbo", "coca-cola", "pfizer", "unilever", "danone", "loreal", "samsung"];
const TOPICS = ["pauta", "seo", "redes", "email", "crm", "landing", "reporte", "branding", "video", "eventos"];
const TOOLS = ["HubSpot", "Google Ads", "Meta Ads", "Looker Studio", "Semrush", "Mailchimp", "Notion", "ClickUp"];

/** Genera `count` notas sintéticas repartidas entre canónico/ y aportes/ (criterio de aceptación de fase 1). */
export function generateNotes(count: number): Record<string, string> {
  const out: Record<string, string> = {};
  const people = ["ana", "carlos-m", "lucia", "pedro"];
  for (let i = 0; i < count; i++) {
    const client = CLIENTS[i % CLIENTS.length]!;
    const topic = TOPICS[(i * 7) % TOPICS.length]!;
    const tool = TOOLS[(i * 3) % TOOLS.length]!;
    const person = people[i % people.length]!;
    const canonical = i % 5 === 0;
    const tipo = i % 4 === 0 ? "proceso" : i % 4 === 1 ? "cliente" : i % 4 === 2 ? "decision" : "referencia";
    const rel = canonical
      ? `canónico/${tipo === "cliente" ? "clientes" : tipo === "proceso" ? "procesos" : "decisiones"}/${client}-${topic}-${i}.md`
      : `aportes/${person}/${client}-${topic}-${i}.md`;
    const month = String((i % 12) + 1).padStart(2, "0");
    out[rel] = note(
      {
        tipo,
        titulo: `${client.toUpperCase()}: ${topic} con ${tool} (${i})`,
        cliente: client,
        tags: [topic, tool.toLowerCase().replace(/\s+/g, "-")],
        autor: canonical ? "ana" : person,
        actualizado: `2026-${month}-15`,
        fuente: i % 3 === 0 ? "claude-code" : "humano",
        estado: canonical ? "validado" : "borrador",
      },
      `## Contexto
Nota ${i} sobre ${topic} para el cliente ${client}. La herramienta principal es ${tool}.
${i % 9 === 0 ? "Integra HubSpot con los formularios y reporta en Looker." : "Sin integraciones especiales."}

## Detalles
Objetivo del trimestre: mejorar ${topic}. Responsable: ${person}. Presupuesto aprobado en ${month}/2026.

## Relacionado
- [[canónico/procesos/reporte-mensual]]`,
    );
  }
  return out;
}

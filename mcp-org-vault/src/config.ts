import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";

export const DEFAULT_EXCLUDE = ["archivo", "adjuntos", "_plantillas"];
/** Nombre de la carpeta canónica dentro de Org/. Solo el curador escribe ahí. */
export const CANONICAL_FOLDER = "canónico";
/** Carpeta donde cada persona escribe: aportes/<person>/. */
export const APORTES_FOLDER = "aportes";
export const PERSON_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

const configSchema = z.object({
  vaultPath: z.string().min(1, "vaultPath es obligatorio"),
  orgFolder: z.string().min(1).default("Org"),
  person: z
    .string()
    .min(1, "person es obligatorio")
    .regex(PERSON_SLUG_RE, "person debe ser un slug en minúsculas sin acentos (ej. ana, carlos-m)"),
  excludeFolders: z.array(z.string()).default(DEFAULT_EXCLUDE),
  maxResults: z.number().int().min(1).max(50).default(8),
  maxNoteChars: z.number().int().min(500).default(6000),
  usageLog: z.string().default("~/.org-vault/usage.jsonl"),
  indexDb: z.string().default("~/.org-vault/index.db"),
  watch: z.boolean().default(true),
});

export type Config = z.infer<typeof configSchema> & {
  /** Ruta absoluta a <vaultPath>/<orgFolder>. */
  orgPath: string;
  /** Archivo de configuración usado, o null si solo hubo variables de entorno. */
  configFile: string | null;
};

export class ConfigError extends Error {}

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

function readConfigFile(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    throw new ConfigError(`No se pudo leer ${file}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`${file} no es JSON válido: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConfigError(`${file} debe contener un objeto JSON`);
  }
  return parsed as Record<string, unknown>;
}

function envOverrides(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (env.ORG_VAULT_PATH) out.vaultPath = env.ORG_VAULT_PATH;
  if (env.ORG_VAULT_ORG_FOLDER) out.orgFolder = env.ORG_VAULT_ORG_FOLDER;
  if (env.ORG_VAULT_PERSON) out.person = env.ORG_VAULT_PERSON;
  if (env.ORG_VAULT_EXCLUDE) {
    out.excludeFolders = env.ORG_VAULT_EXCLUDE.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (env.ORG_VAULT_MAX_RESULTS) out.maxResults = Number(env.ORG_VAULT_MAX_RESULTS);
  if (env.ORG_VAULT_MAX_NOTE_CHARS) out.maxNoteChars = Number(env.ORG_VAULT_MAX_NOTE_CHARS);
  if (env.ORG_VAULT_USAGE_LOG) out.usageLog = env.ORG_VAULT_USAGE_LOG;
  if (env.ORG_VAULT_INDEX_DB) out.indexDb = env.ORG_VAULT_INDEX_DB;
  if (env.ORG_VAULT_WATCH) out.watch = env.ORG_VAULT_WATCH !== "0" && env.ORG_VAULT_WATCH !== "false";
  return out;
}

/**
 * Carga la configuración: variables de entorno > ~/.org-vault/config.json (o ORG_VAULT_CONFIG) > defaults.
 * Lanza ConfigError con mensaje claro si falta algo esencial.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const configFile = expandHome(env.ORG_VAULT_CONFIG ?? "~/.org-vault/config.json");
  const fromFile = readConfigFile(configFile);
  const merged = { ...fromFile, ...envOverrides(env) };
  return buildConfig(merged, existsSync(configFile) ? configFile : null);
}

/** Construye y valida una configuración a partir de un objeto (también usado en tests). */
export function buildConfig(input: Record<string, unknown>, configFile: string | null = null): Config {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ");
    throw new ConfigError(
      `Configuración inválida (${configFile ?? "variables de entorno"}): ${issues}. ` +
        `Define vaultPath y person en ~/.org-vault/config.json o en ORG_VAULT_PATH / ORG_VAULT_PERSON.`,
    );
  }
  const cfg = parsed.data;
  const vaultPath = path.resolve(expandHome(cfg.vaultPath));
  const orgPath = path.join(vaultPath, cfg.orgFolder);
  if (!existsSync(vaultPath) || !statSync(vaultPath).isDirectory()) {
    throw new ConfigError(`El baúl no existe o no es una carpeta: ${vaultPath}`);
  }
  if (!existsSync(orgPath) || !statSync(orgPath).isDirectory()) {
    throw new ConfigError(
      `No existe la carpeta ${cfg.orgFolder}/ dentro del baúl: ${orgPath}. ` +
        `Copia vault-template/Org/ al baúl o ejecuta scripts/install-mcp.sh.`,
    );
  }
  return {
    ...cfg,
    vaultPath,
    orgPath,
    usageLog: path.resolve(expandHome(cfg.usageLog)),
    indexDb: path.resolve(expandHome(cfg.indexDb)),
    configFile,
  };
}

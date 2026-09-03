import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, loadConfig } from "./config.js";
import { Fts5UnavailableError } from "./indexer/db.js";
import { createRuntime } from "./runtime.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const log = (msg: string): void => {
  process.stderr.write(`[org-vault] ${msg}\n`);
};

function usage(): void {
  process.stderr.write(
    [
      `mcp-org-vault ${SERVER_VERSION} — servidor MCP (stdio) para la carpeta Org/ de un baúl Obsidian`,
      "",
      "Uso:",
      "  mcp-org-vault            arranca el servidor por stdio (lo invoca Claude Code)",
      "  mcp-org-vault --check    valida la configuración, indexa Org/ y muestra un resumen JSON",
      "  mcp-org-vault --help",
      "",
      "Configuración: ~/.org-vault/config.json (o ORG_VAULT_CONFIG) y variables ORG_VAULT_PATH, ORG_VAULT_PERSON, ...",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      log(`ERROR de configuración: ${err.message}`);
      process.exit(2);
    }
    throw err;
  }

  let runtime;
  try {
    runtime = createRuntime({ ...config, watch: args.includes("--check") ? false : config.watch }, log);
  } catch (err) {
    if (err instanceof Fts5UnavailableError) {
      log(`ERROR: ${err.message}`);
      process.exit(3);
    }
    throw err;
  }

  if (args.includes("--check")) {
    const summary = {
      ok: true,
      server: `${SERVER_NAME} ${SERVER_VERSION}`,
      configFile: config.configFile,
      vaultPath: config.vaultPath,
      orgPath: config.orgPath,
      person: config.person,
      indexDb: config.indexDb,
      usageLog: config.usageLog,
      excludeFolders: config.excludeFolders,
      scan: runtime.scan,
      notesIndexed: runtime.ctx.index.count(),
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    await runtime.close();
    return;
  }

  log(
    `Org/ en ${config.orgPath} · persona ${config.person} · ${runtime.ctx.index.count()} notas ` +
      `(indexadas ${runtime.scan.indexed}, sin cambios ${runtime.scan.skipped}, eliminadas ${runtime.scan.removed}, ${runtime.scan.ms} ms)`,
  );

  const server = createServer(runtime.ctx);
  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    try {
      await server.close();
    } catch {
      // ignore
    }
    await runtime.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  process.stdin.on("close", () => void shutdown());

  await server.connect(transport);
}

main().catch((err: Error) => {
  log(`ERROR fatal: ${err.stack ?? err.message}`);
  process.exit(1);
});

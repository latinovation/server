#!/usr/bin/env node
/**
 * Prueba de humo: arranca mcp-org-vault/dist/index.js por stdio contra un baúl temporal
 * (copia de vault-template/Org) y ejecuta el flujo completo como lo haría Claude Code.
 *
 * Uso: node scripts/smoke-stdio.mjs   (requiere `npm run build` previo)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(repo, "mcp-org-vault", "dist", "index.js");
const template = path.join(repo, "vault-template", "Org");

const root = mkdtempSync(path.join(tmpdir(), "org-vault-smoke-"));
cpSync(template, path.join(root, "Org"), { recursive: true });
mkdirSync(path.join(root, "Org", "canónico", "clientes"), { recursive: true });
writeFileSync(
  path.join(root, "Org", "canónico", "clientes", "msd.md"),
  '---\ntipo: cliente\ntitulo: "MSD: contexto"\ncliente: msd\ntags: [hubspot]\nautor: ana\nactualizado: 2026-08-20\nfuente: humano\nestado: validado\n---\n\n## Contexto\nMSD usa HubSpot.\n',
);

const transport = new StdioClientTransport({
  command: "node",
  args: [dist],
  env: {
    ...process.env,
    ORG_VAULT_PATH: root,
    ORG_VAULT_PERSON: "smoke",
    ORG_VAULT_INDEX_DB: path.join(root, "index.db"),
    ORG_VAULT_USAGE_LOG: path.join(root, "usage.jsonl"),
  },
  stderr: "pipe",
});
transport.stderr?.on("data", (d) => process.stderr.write(`  [server] ${d}`));
const client = new Client({ name: "smoke", version: "0.0.0" });

let failed = false;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? ` · ${extra}` : ""}`);
  if (!ok) failed = true;
};

try {
  await client.connect(transport);
  const text = (r) => r.content[0].text;
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  check("5 tools registradas", tools.length === 5, tools.join(", "));
  check("instrucciones incluyen Org/CLAUDE.md", (client.getInstructions() ?? "").includes("Latinovation"));

  const s = JSON.parse(text(await client.callTool({ name: "search_notes", arguments: { query: "msd hubspot" } })));
  check("search_notes encuentra la nota", s.total === 1 && s.results[0].path === "canónico/clientes/msd.md", `snippet: ${s.results[0]?.snippet}`);

  const r = JSON.parse(text(await client.callTool({ name: "read_note", arguments: { path: s.results[0].path, section: "Contexto" } })));
  check("read_note con section", r.body === "MSD usa HubSpot.", JSON.stringify(r.body));

  const w = JSON.parse(
    text(await client.callTool({ name: "write_session_note", arguments: { slug: "smoke", hizo: "Prueba stdio", aprendio: "Nada nuevo", consultadas: [s.results[0].path] } })),
  );
  check("write_session_note crea el cierre", /^aportes\/smoke\/\d{4}-\d{2}-\d{2}-\d{4}-smoke\.md$/.test(w.path), w.path);

  const again = JSON.parse(text(await client.callTool({ name: "search_notes", arguments: { query: "stdio" } })));
  check("el cierre queda indexado al instante", again.total === 1);

  const bad = await client.callTool({ name: "upsert_context_note", arguments: { path: "canónico/x.md", frontmatter: { tipo: "cliente", titulo: "x" }, body: "x" } });
  check("escritura en canónico/ rechazada", bad.isError === true && text(bad).includes("forbidden_folder"));

  const res = (await client.listResources()).resources.map((x) => x.uri);
  check("recursos claude-md y plantillas", res.includes("orgvault://claude-md") && res.includes("orgvault://plantillas/cierre-sesion"), res.join(", "));

  await client.close();
  const lines = readFileSync(path.join(root, "usage.jsonl"), "utf8").trim().split("\n").length;
  check("usage.jsonl registra las llamadas", lines === 4, `${lines} líneas`);
} catch (err) {
  failed = true;
  console.error("✗ excepción:", err);
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log(failed ? "SMOKE FAILED" : "SMOKE OK");
process.exit(failed ? 1 : 0);

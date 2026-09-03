import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { createTestVault, type TestVault } from "./helpers/vault.js";

let v: TestVault;
let client: Client;

function text(result: unknown): string {
  const r = result as { content: { type: string; text?: string }[] };
  return r.content[0]?.text ?? "";
}

beforeAll(async () => {
  v = createTestVault({ notes: { "_plantillas/cierre-sesion.md": "---\ntipo: cierre\n---\n\n## Qué se hizo\n" } });
  const server = createServer(v.ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await v.cleanup();
});

describe("servidor MCP (extremo a extremo, en memoria)", () => {
  it("expone las cinco tools con esquemas de entrada", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "list_notes",
      "read_note",
      "search_notes",
      "upsert_context_note",
      "write_session_note",
    ]);
    const search = tools.find((t) => t.name === "search_notes")!;
    expect(search.inputSchema.properties).toHaveProperty("query");
    expect(search.annotations?.readOnlyHint).toBe(true);
  });

  it("las instrucciones del servidor incluyen Org/CLAUDE.md", () => {
    expect(client.getInstructions()).toContain("Reglas para agentes: buscar antes de leer.");
    expect(client.getInstructions()).toContain("search_notes");
  });

  it("search_notes → read_note por MCP", async () => {
    const search = await client.callTool({ name: "search_notes", arguments: { query: "MSD HubSpot" } });
    const found = JSON.parse(text(search)) as { results: { path: string }[]; total: number };
    expect(found.total).toBe(2);
    const read = await client.callTool({ name: "read_note", arguments: { path: found.results[0]!.path, section: "Contexto" } });
    const note = JSON.parse(text(read)) as { body: string; truncated: boolean };
    expect(note.body.length).toBeGreaterThan(10);
    expect(note.truncated).toBe(false);
  });

  it("los errores de validación vuelven como isError con código", async () => {
    const r = await client.callTool({ name: "upsert_context_note", arguments: { path: "canónico/x.md", frontmatter: { tipo: "cliente", titulo: "x" }, body: "x" } });
    expect(r.isError).toBe(true);
    expect(JSON.parse(text(r))).toMatchObject({ error: "forbidden_folder" });
  });

  it("argumentos que no cumplen el esquema son rechazados por el SDK", async () => {
    const r = await client.callTool({ name: "search_notes", arguments: { query: 123 } });
    expect(r.isError).toBe(true);
  });

  it("recursos: orgvault://claude-md y plantillas", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("orgvault://claude-md");
    const claude = await client.readResource({ uri: "orgvault://claude-md" });
    expect((claude.contents[0] as { text: string }).text).toContain("Latinovation");

    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toContain("orgvault://plantillas/{nombre}");
    expect(resources.map((r) => r.uri)).toContain("orgvault://plantillas/cierre-sesion");
    const tpl = await client.readResource({ uri: "orgvault://plantillas/cierre-sesion" });
    expect((tpl.contents[0] as { text: string }).text).toContain("## Qué se hizo");
    await expect(client.readResource({ uri: "orgvault://plantillas/no-existe" })).rejects.toThrow(/No existe la plantilla/);
  });
});

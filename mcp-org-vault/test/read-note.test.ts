import { afterAll, describe, expect, it } from "vitest";
import { ToolError } from "../src/paths.js";
import { readNote } from "../src/tools/read-note.js";
import { createTestVault, note } from "./helpers/vault.js";

const v = createTestVault({ maxNoteChars: 600 });
afterAll(() => v.cleanup());

describe("read_note", () => {
  it("devuelve frontmatter normalizado, cuerpo, enlaces y secciones", async () => {
    const r = await readNote(v.ctx, { path: "canónico/clientes/msd.md" });
    expect(r.path).toBe("canónico/clientes/msd.md");
    expect(r.frontmatter.tipo).toBe("cliente");
    expect(r.frontmatter.actualizado).toBe("2026-08-20");
    expect(r.body).toContain("## Contexto");
    expect(r.links).toEqual(["canónico/procesos/reporte-mensual"]);
    expect(r.sections).toEqual(["Contexto", "Contactos", "Herramientas"]);
    expect(r.truncated).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it("section devuelve solo ese bloque (sin distinguir acentos ni mayúsculas)", async () => {
    const r = await readNote(v.ctx, { path: "canónico/clientes/msd.md", section: "## contactos" });
    expect(r.body).toContain("Laura Pérez");
    expect(r.body).not.toContain("HubSpot Marketing Hub");
  });

  it("section inexistente: error con las secciones disponibles", async () => {
    await expect(readNote(v.ctx, { path: "canónico/clientes/msd.md", section: "Nada" })).rejects.toThrow(/Contexto \| Contactos/);
  });

  it("rechaza path traversal y rutas fuera de Org/", async () => {
    await expect(readNote(v.ctx, { path: "../Org/canónico/clientes/msd.md" })).rejects.toThrow(ToolError);
    await expect(readNote(v.ctx, { path: "/etc/hosts" })).rejects.toThrow(ToolError);
  });

  it("nota inexistente: error not_found", async () => {
    await expect(readNote(v.ctx, { path: "canónico/clientes/nadie.md" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("trunca a maxNoteChars y lo indica", async () => {
    v.write("aportes/ana/larga.md", note({ tipo: "referencia", titulo: "Larga" }, "## Todo\n" + "palabra ".repeat(400)));
    const r = await readNote(v.ctx, { path: "aportes/ana/larga.md" });
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBeLessThan(600 + 120);
    expect(r.body).toContain("truncado");
  });

  it("nota sin frontmatter se lee igual con avisos", async () => {
    const r = await readNote(v.ctx, { path: "aportes/carlos-m/sin-frontmatter.md" });
    expect(r.frontmatter).toEqual({});
    expect(r.warnings).toContain("sin-frontmatter");
  });

  it("registra la lectura en usage.jsonl", async () => {
    const lines = await v.usageLines();
    const reads = lines.filter((l) => l.tool === "read_note");
    expect(reads.length).toBeGreaterThan(0);
    expect(reads[0]).toMatchObject({ person: "ana", path: "canónico/clientes/msd.md", query: null });
    expect(reads[0]!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

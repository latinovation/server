import { afterAll, describe, expect, it } from "vitest";
import { searchNotes } from "../src/tools/search-notes.js";
import { createTestVault } from "./helpers/vault.js";

const v = createTestVault();
afterAll(() => v.cleanup());

describe("search_notes", () => {
  it("query vacía → error", async () => {
    await expect(searchNotes(v.ctx, { query: "  " })).rejects.toMatchObject({ code: "empty_query" });
    await expect(searchNotes(v.ctx, { query: "(((" })).rejects.toMatchObject({ code: "empty_query" });
  });

  it("encuentra MSD HubSpot con snippet, sin incluir archivo/, _plantillas/ ni ocultas", async () => {
    const r = await searchNotes(v.ctx, { query: "MSD HubSpot" });
    expect(r.mode).toBe("and");
    expect(r.total).toBe(2);
    const paths = r.results.map((x) => x.path);
    expect(paths).toContain("canónico/clientes/msd.md");
    expect(paths).toContain("aportes/ana/msd-hubspot-integracion.md");
    expect(paths.some((p) => p.startsWith("archivo/") || p.startsWith("_plantillas/") || p.startsWith("."))).toBe(false);
    for (const hit of r.results) {
      expect(hit.snippet.length).toBeLessThanOrEqual(200);
      expect(hit.snippet).toMatch(/«/);
      expect(hit.score).toBeGreaterThan(0);
      expect(hit).toHaveProperty("estado");
      expect(hit).toHaveProperty("actualizado");
    }
  });

  it("no distingue acentos", async () => {
    const r = await searchNotes(v.ctx, { query: "farmaceutico" });
    expect(r.results[0]!.path).toBe("canónico/clientes/msd.md");
  });

  it("relaja a OR cuando el AND no devuelve nada", async () => {
    const r = await searchNotes(v.ctx, { query: "glosario looker" });
    expect(r.mode).toBe("or");
    expect(r.total).toBeGreaterThanOrEqual(2);
  });

  it("filtros: tipo, cliente, autor, soloCanonico, limit", async () => {
    expect((await searchNotes(v.ctx, { query: "hubspot", soloCanonico: true })).results.map((h) => h.path)).toEqual([
      "canónico/clientes/msd.md",
      "canónico/procesos/reporte-mensual.md",
    ]);
    expect((await searchNotes(v.ctx, { query: "hubspot", tipo: "proceso" })).total).toBe(1);
    expect((await searchNotes(v.ctx, { query: "hubspot", cliente: "msd" })).total).toBe(2);
    expect((await searchNotes(v.ctx, { query: "hubspot", autor: "carlos-m" })).total).toBe(1);
    const limited = await searchNotes(v.ctx, { query: "hubspot", limit: 1 });
    expect(limited.results).toHaveLength(1);
    expect(limited.total).toBe(3);
  });

  it("nunca devuelve más de maxResults por defecto", async () => {
    const r = await searchNotes(v.ctx, { query: "de OR la OR el OR y OR con" });
    expect(r.results.length).toBeLessThanOrEqual(v.config.maxResults);
  });

  it("sin resultados: total 0 y queda registrado con results 0", async () => {
    const r = await searchNotes(v.ctx, { query: "zanahoria" });
    expect(r.total).toBe(0);
    const lines = await v.usageLines();
    const last = lines.filter((l) => l.tool === "search_notes").pop()!;
    expect(last).toMatchObject({ query: "zanahoria", results: 0, path: null });
  });
});

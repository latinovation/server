import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseNote } from "../src/indexer/parser.js";
import { searchNotes } from "../src/tools/search-notes.js";
import { upsertContextNote } from "../src/tools/upsert-context-note.js";
import { writeSessionNote } from "../src/tools/write-session-note.js";
import { createTestVault, generateNotes, type TestVault } from "./helpers/vault.js";

/** Criterio de aceptación de la fase 1 (docs/PLAN.md §9). */
describe("aceptación fase 1: Org/ con 300 notas", () => {
  let v: TestVault;
  beforeAll(() => {
    v = createTestVault({ notes: generateNotes(300), person: "ana" });
  });
  afterAll(() => v.cleanup());

  it("el índice contiene las 300 notas generadas más las fixtures", () => {
    expect(v.index.count()).toBe(307);
  });

  it('search_notes("MSD HubSpot") responde en < 200 ms y devuelve ≤ 8 resultados con snippet', async () => {
    const t0 = performance.now();
    const r = await searchNotes(v.ctx, { query: "MSD HubSpot" });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(200);
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.length).toBeLessThanOrEqual(8);
    for (const hit of r.results) {
      expect(hit.snippet.length).toBeGreaterThan(0);
      expect(hit.snippet.length).toBeLessThanOrEqual(200);
    }
    // hay notas canónicas entre los resultados y el orden es por relevancia (mayor score primero)
    expect(r.results.some((h) => h.path.startsWith("canónico/"))).toBe(true);
    const scores = r.results.map((h) => h.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("write_session_note crea un archivo válido según las convenciones", async () => {
    const r = await writeSessionNote(v.ctx, {
      slug: "aceptacion",
      hizo: "Prueba de aceptación de fase 1.",
      aprendio: "El índice FTS responde en milisegundos con 300 notas.",
      consultadas: ["canónico/clientes/msd.md"],
    });
    const parsed = parseNote(v.read(r.path), r.path);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.tipo).toBe("cierre");
    expect(r.path).toMatch(/^aportes\/ana\/\d{4}-\d{2}-\d{2}-\d{4}-aceptacion\.md$/);
  });

  it("una escritura en canónico/ es rechazada", async () => {
    await expect(
      upsertContextNote(v.ctx, { path: "canónico/clientes/msd.md", frontmatter: { tipo: "cliente", titulo: "x" }, body: "x" }),
    ).rejects.toMatchObject({ code: "forbidden_folder" });
    expect(parseNote(v.read("canónico/clientes/msd.md"), "canónico/clientes/msd.md").title).toBe("MSD: contexto de cuenta");
  });

  it("el escaneo completo de 300 notas es rápido y el rescan no reindexa nada", () => {
    const t0 = performance.now();
    const r = v.scanner.scan();
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(r.indexed).toBe(0);
    expect(r.total).toBe(308);
  });
});

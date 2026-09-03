import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanSnippet, NoteIndex } from "../src/indexer/db.js";
import { parseNote } from "../src/indexer/parser.js";

function add(index: NoteIndex, rel: string, content: string, mtimeMs = 1_700_000_000_000): void {
  index.upsert(rel, parseNote(content, rel), { mtimeMs, size: content.length });
}

describe("NoteIndex", () => {
  let index: NoteIndex;
  beforeEach(() => {
    index = new NoteIndex(":memory:");
  });
  afterEach(() => index.close());

  it("FTS5 está disponible en el binario (punto 7 de la sección 10)", () => {
    const row = index.db.prepare("SELECT sqlite_version() AS v").get() as { v: string };
    expect(row.v).toMatch(/^3\./);
    expect(() => index.db.exec("CREATE VIRTUAL TABLE temp.t USING fts5(a); DROP TABLE temp.t;")).not.toThrow();
  });

  it("indexa, busca sin distinguir acentos ni mayúsculas y devuelve snippet", () => {
    add(index, "canónico/clientes/msd.md", "---\ntipo: cliente\ntitulo: MSD\nestado: validado\n---\nLa carpeta canónico tiene HubSpot.");
    const { hits, total } = index.search({ match: '"canonico" "hubspot"', limit: 8 });
    expect(total).toBe(1);
    expect(hits[0]!.path).toBe("canónico/clientes/msd.md");
    expect(hits[0]!.snippet).toContain("«canónico»");
    expect(hits[0]!.score).toBeGreaterThanOrEqual(0); // con un solo documento, bm25 ≈ 0
  });

  it("búsqueda por prefijo", () => {
    add(index, "a.md", "---\ntipo: proceso\ntitulo: Uno\n---\nIntegración con HubSpot");
    expect(index.search({ match: '"hub"*', limit: 8 }).total).toBe(1);
    expect(index.search({ match: '"hubx"*', limit: 8 }).total).toBe(0);
  });

  it("filtra por tipo, cliente, autor y soloCanonico", () => {
    add(index, "canónico/clientes/msd.md", "---\ntipo: cliente\ntitulo: MSD\ncliente: msd\nautor: ana\nestado: validado\n---\nHubSpot");
    add(index, "aportes/ana/x.md", "---\ntipo: proceso\ntitulo: X\ncliente: bayer\nautor: ana\n---\nHubSpot");
    add(index, "aportes/carlos-m/y.md", "---\ntipo: proceso\ntitulo: Y\ncliente: msd\nautor: carlos-m\n---\nHubSpot");
    expect(index.search({ match: '"hubspot"', limit: 8 }).total).toBe(3);
    expect(index.search({ match: '"hubspot"', tipo: "proceso", limit: 8 }).total).toBe(2);
    expect(index.search({ match: '"hubspot"', cliente: "msd", limit: 8 }).total).toBe(2);
    expect(index.search({ match: '"hubspot"', autor: "carlos-m", limit: 8 }).total).toBe(1);
    expect(index.search({ match: '"hubspot"', soloCanonico: true, limit: 8 }).hits.map((h) => h.path)).toEqual([
      "canónico/clientes/msd.md",
    ]);
  });

  it("a igualdad de score, canónico validado va primero", () => {
    const body = "---\ntipo: proceso\ntitulo: Igual\n---\nreporte mensual de pauta";
    add(index, "aportes/ana/a.md", body.replace("---\n---", "---\nestado: borrador\n---"));
    add(index, "canónico/procesos/b.md", body.replace("titulo: Igual", "titulo: Igual\nestado: validado"));
    add(index, "aportes/carlos-m/c.md", body);
    const { hits } = index.search({ match: '"reporte"', limit: 8 });
    expect(hits[0]!.path).toBe("canónico/procesos/b.md");
  });

  it("respeta limit y devuelve total completo", () => {
    for (let i = 0; i < 12; i++) add(index, `aportes/ana/n${i}.md`, `---\ntipo: proceso\ntitulo: N${i}\n---\nhubspot ${i}`);
    const r = index.search({ match: '"hubspot"', limit: 5 });
    expect(r.hits).toHaveLength(5);
    expect(r.total).toBe(12);
  });

  it("upsert reemplaza el contenido anterior en el FTS", () => {
    add(index, "a.md", "---\ntipo: proceso\ntitulo: A\n---\nprimero");
    add(index, "a.md", "---\ntipo: proceso\ntitulo: A\n---\nsegundo");
    expect(index.search({ match: '"primero"', limit: 8 }).total).toBe(0);
    expect(index.search({ match: '"segundo"', limit: 8 }).total).toBe(1);
    expect(index.count()).toBe(1);
  });

  it("remove y removeMissing limpian notes y notes_fts", () => {
    add(index, "a.md", "---\ntipo: proceso\ntitulo: A\n---\nuno");
    add(index, "b.md", "---\ntipo: proceso\ntitulo: B\n---\ndos");
    expect(index.remove("a.md")).toBe(true);
    expect(index.remove("a.md")).toBe(false);
    expect(index.removeMissing(new Set())).toBe(1);
    expect(index.count()).toBe(0);
    expect(index.search({ match: '"dos"', limit: 8 }).total).toBe(0);
  });

  it("list filtra por carpeta, tipo, fecha y ordena por actualizado desc", () => {
    add(index, "canónico/clientes/a.md", "---\ntipo: cliente\ntitulo: A\nactualizado: 2026-01-01\n---\nx");
    add(index, "canónico/clientes/b.md", "---\ntipo: cliente\ntitulo: B\nactualizado: 2026-06-01\n---\nx");
    add(index, "aportes/ana/c.md", "---\ntipo: proceso\ntitulo: C\nactualizado: 2026-03-01\n---\nx");
    add(index, "aportes/ana/d.md", "# D\nsin frontmatter", new Date("2026-08-01").getTime());
    expect(index.list({ folder: "canónico", limit: 50 }).map((r) => r.path)).toEqual(["canónico/clientes/b.md", "canónico/clientes/a.md"]);
    expect(index.list({ tipo: "proceso", limit: 50 }).map((r) => r.path)).toEqual(["aportes/ana/c.md"]);
    expect(index.list({ desde: "2026-04-01", limit: 50 }).map((r) => r.path)).toEqual(["aportes/ana/d.md", "canónico/clientes/b.md"]);
    expect(index.list({ limit: 2 })).toHaveLength(2);
    expect(index.get("aportes/ana/d.md")!.warnings).toContain("sin-frontmatter");
  });

  it("list con carpeta que contiene % o _ no se interpreta como comodín", () => {
    add(index, "aportes/ana_x/a.md", "---\ntipo: proceso\ntitulo: A\n---\nx");
    add(index, "aportes/anaXx/b.md", "---\ntipo: proceso\ntitulo: B\n---\nx");
    expect(index.list({ folder: "aportes/ana_x", limit: 50 }).map((r) => r.path)).toEqual(["aportes/ana_x/a.md"]);
  });

  it("cleanSnippet colapsa espacios y recorta a 200 caracteres", () => {
    expect(cleanSnippet("a\n\n  b")).toBe("a b");
    expect(cleanSnippet("x".repeat(300)).length).toBeLessThanOrEqual(200);
  });
});

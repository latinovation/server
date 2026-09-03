import { afterAll, describe, expect, it } from "vitest";
import { parseNote } from "../src/indexer/parser.js";
import { upsertContextNote } from "../src/tools/upsert-context-note.js";
import { createTestVault } from "./helpers/vault.js";

const v = createTestVault({ person: "ana" });
afterAll(() => v.cleanup());

const fm = { tipo: "cliente", titulo: "Bayer: contexto de cuenta", cliente: "bayer", tags: ["farma"] };

describe("upsert_context_note", () => {
  it("crea la nota con frontmatter completo y la indexa", async () => {
    const r = await upsertContextNote(v.ctx, { path: "aportes/ana/bayer-contexto.md", frontmatter: fm, body: "## Contexto\nBayer usa Salesforce." });
    expect(r).toMatchObject({ path: "aportes/ana/bayer-contexto.md", created: true, words: 4 });
    const parsed = parseNote(v.read(r.path), r.path);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.frontmatter).toMatchObject({ tipo: "cliente", cliente: "bayer", autor: "ana", fuente: "claude-code", estado: "borrador" });
    expect(parsed.actualizado).toBe("2026-09-03");
    expect(v.index.search({ match: '"salesforce"', limit: 8 }).total).toBe(1);
  });

  it("actualiza una nota existente (created: false) y conserva claves extra", async () => {
    const r = await upsertContextNote(v.ctx, {
      path: "aportes/ana/bayer-contexto.md",
      frontmatter: { ...fm, actualizado: "2026-09-02", url: "https://example.com" },
      body: "Bayer migró a HubSpot.",
    });
    expect(r.created).toBe(false);
    const parsed = parseNote(v.read(r.path), r.path);
    expect(parsed.frontmatter.url).toBe("https://example.com");
    expect(parsed.actualizado).toBe("2026-09-02");
    expect(v.index.search({ match: '"salesforce"', limit: 8 }).total).toBe(0);
  });

  it("rechaza canónico/, otras personas y path traversal", async () => {
    await expect(upsertContextNote(v.ctx, { path: "canónico/clientes/bayer.md", frontmatter: fm, body: "x" })).rejects.toMatchObject({
      code: "forbidden_folder",
    });
    await expect(upsertContextNote(v.ctx, { path: "aportes/carlos-m/bayer.md", frontmatter: fm, body: "x" })).rejects.toMatchObject({
      code: "forbidden_folder",
    });
    await expect(upsertContextNote(v.ctx, { path: "aportes/ana/../../x.md", frontmatter: fm, body: "x" })).rejects.toMatchObject({
      code: "path_outside_org",
    });
    expect(v.exists("canónico/clientes/bayer.md")).toBe(false);
  });

  it("valida el frontmatter con zod", async () => {
    const p = "aportes/ana/mala.md";
    await expect(upsertContextNote(v.ctx, { path: p, frontmatter: { ...fm, tipo: "cosa" }, body: "x" })).rejects.toThrow(/tipo/);
    await expect(upsertContextNote(v.ctx, { path: p, frontmatter: { tipo: "cliente" }, body: "x" })).rejects.toThrow(/titulo/);
    await expect(upsertContextNote(v.ctx, { path: p, frontmatter: { ...fm, cliente: "Bayer S.A." }, body: "x" })).rejects.toThrow(/cliente/);
    await expect(upsertContextNote(v.ctx, { path: p, frontmatter: { ...fm, estado: "validado" }, body: "x" })).rejects.toThrow(/curador/);
    await expect(upsertContextNote(v.ctx, { path: p, frontmatter: { ...fm, autor: "carlos-m" }, body: "x" })).rejects.toThrow(/autor/);
    await expect(upsertContextNote(v.ctx, { path: p, frontmatter: { ...fm, tipo: "cierre" }, body: "x" })).rejects.toThrow(/write_session_note/);
    await expect(upsertContextNote(v.ctx, { path: p, frontmatter: { ...fm, actualizado: "hoy" }, body: "x" })).rejects.toThrow(/YYYY-MM-DD/);
    expect(v.exists(p)).toBe(false);
  });

  it("rechaza cuerpo vacío o de más de 500 palabras", async () => {
    await expect(upsertContextNote(v.ctx, { path: "aportes/ana/vacia.md", frontmatter: fm, body: "  " })).rejects.toThrow(/vac/);
    const long = Array.from({ length: 501 }, (_, i) => `p${i}`).join(" ");
    await expect(upsertContextNote(v.ctx, { path: "aportes/ana/larga.md", frontmatter: fm, body: long })).rejects.toMatchObject({ code: "too_long" });
  });
});

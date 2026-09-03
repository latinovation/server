import { afterAll, describe, expect, it } from "vitest";
import { listNotes } from "../src/tools/list-notes.js";
import { createTestVault, generateNotes } from "./helpers/vault.js";

const v = createTestVault({ notes: generateNotes(120) });
afterAll(() => v.cleanup());

describe("list_notes", () => {
  it("devuelve solo metadatos, con avisos de notas malformadas", async () => {
    const r = await listNotes(v.ctx, { folder: "aportes/carlos-m", limit: 50 });
    const paths = r.notes.map((n) => n.path);
    expect(paths).toContain("aportes/carlos-m/sin-frontmatter.md");
    expect(paths.every((p) => p.startsWith("aportes/carlos-m/"))).toBe(true);
    expect(r.notes[0]).not.toHaveProperty("body");
    expect(r.warnings.find((w) => w.path === "aportes/carlos-m/sin-frontmatter.md")!.warnings).toContain("sin-frontmatter");
    expect(r.warnings.find((w) => w.path === "aportes/carlos-m/tipo-raro.md")!.warnings).toContain("tipo-invalido: cosa");
    expect(r.indexed).toBe(127);
  });

  it("límite por defecto 20 y máximo 50", async () => {
    expect((await listNotes(v.ctx, {})).notes).toHaveLength(20);
    expect((await listNotes(v.ctx, { limit: 50 })).notes).toHaveLength(50);
    expect((await listNotes(v.ctx, { limit: 500 })).notes).toHaveLength(50);
  });

  it("filtra por tipo, cliente y desde", async () => {
    const r = await listNotes(v.ctx, { tipo: "cliente", cliente: "msd", desde: "2026-08-01", limit: 50 });
    expect(r.notes.length).toBeGreaterThan(0);
    for (const n of r.notes) {
      expect(n.tipo).toBe("cliente");
      expect(n.cliente).toBe("msd");
      expect(n.actualizado! >= "2026-08-01").toBe(true);
    }
  });

  it("ordena por actualizado descendente", async () => {
    const r = await listNotes(v.ctx, { folder: "canónico", limit: 50 });
    const dates = r.notes.map((n) => n.actualizado ?? "");
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("rechaza folder con .. y desde inválido", async () => {
    await expect(listNotes(v.ctx, { folder: "../" })).rejects.toThrow();
    await expect(listNotes(v.ctx, { desde: "ayer" })).rejects.toThrow(/YYYY-MM-DD/);
  });
});

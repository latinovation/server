import { afterAll, describe, expect, it } from "vitest";
import { parseNote } from "../src/indexer/parser.js";
import { writeSessionNote } from "../src/tools/write-session-note.js";
import { createTestVault } from "./helpers/vault.js";

const v = createTestVault({ person: "ana", now: new Date(2026, 8, 3, 14, 2, 11) });
afterAll(() => v.cleanup());

describe("write_session_note", () => {
  it("crea un cierre válido según las convenciones y lo indexa", async () => {
    const r = await writeSessionNote(v.ctx, {
      slug: "Propuesta Pauta Q4 MSD",
      hizo: "Se armó la propuesta de pauta Q4 para MSD con presupuesto por canal.",
      aprendio: "MSD exige desglose por país; el template estándar no lo tiene.",
      pendiente: "Laura revisa el jueves.",
      consultadas: ["canónico/clientes/msd.md", "canónico/procesos/reporte-mensual.md"],
      cliente: "MSD",
      tags: ["Pauta", "q4", "pauta"],
    });
    expect(r.path).toBe("aportes/ana/2026-09-03-1402-propuesta-pauta-q4-msd.md");
    expect(v.exists(r.path)).toBe(true);

    const content = v.read(r.path);
    const parsed = parseNote(content, r.path);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.tipo).toBe("cierre");
    expect(parsed.autor).toBe("ana");
    expect(parsed.cliente).toBe("msd");
    expect(parsed.fuente).toBe("claude-code");
    expect(parsed.estado).toBe("borrador");
    expect(parsed.actualizado).toBe("2026-09-03");
    expect(parsed.tags).toEqual(["pauta", "q4"]);
    expect(parsed.title).toBe("Cierre: propuesta pauta q4 msd");
    expect(parsed.sections.map((s) => s.heading)).toEqual([
      "Qué se hizo",
      "Qué se aprendió",
      "Qué queda pendiente",
      "Notas de Org/ consultadas",
    ]);
    expect(parsed.links).toEqual(["canónico/clientes/msd", "canónico/procesos/reporte-mensual"]);
    expect(parsed.body.trim().split("\n").filter((l) => l.trim()).length).toBeLessThanOrEqual(10);

    expect(v.index.get(r.path)?.tipo).toBe("cierre");
    const lines = await v.usageLines();
    expect(lines.some((l) => l.tool === "write_session_note" && l.path === r.path)).toBe(true);
  });

  it("no sobreescribe si ya existe un cierre en el mismo minuto con el mismo slug", async () => {
    const r = await writeSessionNote(v.ctx, { slug: "propuesta-pauta-q4-msd", hizo: "otra vez", aprendio: "nada nuevo" });
    expect(r.path).toBe("aportes/ana/2026-09-03-1402-propuesta-pauta-q4-msd-2.md");
  });

  it("rechaza cuerpo de más de 1500 caracteres", async () => {
    await expect(
      writeSessionNote(v.ctx, { slug: "largo", hizo: "x".repeat(1400), aprendio: "y".repeat(200) }),
    ).rejects.toMatchObject({ code: "too_long" });
    expect(v.exists("aportes/ana/2026-09-03-1402-largo.md")).toBe(false);
  });

  it("rechaza slug vacío, hizo vacío y cliente inválido", async () => {
    await expect(writeSessionNote(v.ctx, { slug: "¡¡¡", hizo: "x", aprendio: "y" })).rejects.toThrow(/slug/);
    await expect(writeSessionNote(v.ctx, { slug: "ok", hizo: "  ", aprendio: "y" })).rejects.toThrow(/hizo/);
    await expect(writeSessionNote(v.ctx, { slug: "ok", hizo: "x", aprendio: "y", cliente: "???" })).rejects.toThrow(/cliente/);
  });

  it("titulo opcional y valores por defecto", async () => {
    const r = await writeSessionNote(v.ctx, { slug: "minimo", titulo: "Cierre mínimo", hizo: "algo", aprendio: "nada" });
    const parsed = parseNote(v.read(r.path), r.path);
    expect(parsed.title).toBe("Cierre mínimo");
    expect(parsed.body).toContain("## Qué queda pendiente\nNada");
    expect(parsed.body).toContain("## Notas de Org/ consultadas\nNinguna");
  });
});

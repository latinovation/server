import { afterEach, describe, expect, it } from "vitest";
import { createTestVault, note, type TestVault } from "./helpers/vault.js";

async function waitFor(fn: () => boolean, ms = 6000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error("timeout esperando al watcher");
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("Scanner", () => {
  let v: TestVault;
  afterEach(async () => v?.cleanup());

  it("escaneo inicial: indexa solo .md fuera de carpetas excluidas y ocultas, y omite Org/CLAUDE.md", () => {
    v = createTestVault();
    const paths = v.index.list({ limit: 50 }).map((r) => r.path).sort();
    expect(paths).toEqual([
      "aportes/ana/glosario-pauta.md",
      "aportes/ana/msd-hubspot-integracion.md",
      "aportes/carlos-m/sin-frontmatter.md",
      "aportes/carlos-m/tipo-raro.md",
      "canónico/clientes/msd.md",
      "canónico/decisiones/looker-vs-datastudio.md",
      "canónico/procesos/reporte-mensual.md",
    ]);
    expect(v.index.get("archivo/vieja.md")).toBeUndefined();
    expect(v.index.get("_plantillas/nota-contexto.md")).toBeUndefined();
    expect(v.index.get("CLAUDE.md")).toBeUndefined();
  });

  it("segundo escaneo salta lo que no cambió (por hash) y detecta cambios y borrados", () => {
    v = createTestVault();
    const first = v.scanner.scan();
    expect(first.indexed).toBe(0);
    expect(first.skipped).toBe(7);

    v.write("aportes/ana/glosario-pauta.md", note({ tipo: "referencia", titulo: "Glosario v2" }, "ROAS nuevo"));
    v.write("aportes/ana/nueva.md", note({ tipo: "proceso", titulo: "Nueva" }, "contenido nuevo"));
    v.remove("aportes/carlos-m/tipo-raro.md");
    const second = v.scanner.scan();
    expect(second.indexed).toBe(2);
    expect(second.removed).toBe(1);
    expect(second.total).toBe(7);
    expect(v.index.get("aportes/ana/glosario-pauta.md")!.title).toBe("Glosario v2");
    expect(v.index.get("aportes/carlos-m/tipo-raro.md")).toBeUndefined();
  });

  it("indexFile indexa un archivo concreto y lo quita si ya no existe", () => {
    v = createTestVault();
    v.write("aportes/ana/directa.md", note({ tipo: "proceso", titulo: "Directa" }, "x"));
    expect(v.scanner.indexFile("aportes/ana/directa.md")).toBe(true);
    expect(v.index.get("aportes/ana/directa.md")).toBeDefined();
    v.remove("aportes/ana/directa.md");
    expect(v.scanner.indexFile("aportes/ana/directa.md")).toBe(false);
    expect(v.index.get("aportes/ana/directa.md")).toBeUndefined();
    expect(v.scanner.indexFile("archivo/vieja.md")).toBe(false);
  });

  it("watcher: un archivo nuevo se indexa tras el debounce y desaparece al borrarlo", async () => {
    v = createTestVault({ watch: true });
    await new Promise((r) => setTimeout(r, 300));
    v.write("aportes/ana/desde-relay.md", note({ tipo: "cliente", titulo: "Llegó por el relay", cliente: "msd" }, "sincronizado"));
    await waitFor(() => v.index.get("aportes/ana/desde-relay.md") !== undefined);
    expect(v.index.search({ match: '"sincronizado"', limit: 8 }).total).toBe(1);

    v.write("aportes/ana/desde-relay.md", note({ tipo: "cliente", titulo: "Editada", cliente: "msd" }, "modificado"));
    await waitFor(() => v.index.get("aportes/ana/desde-relay.md")?.title === "Editada");

    v.remove("aportes/ana/desde-relay.md");
    await waitFor(() => v.index.get("aportes/ana/desde-relay.md") === undefined);

    v.write("archivo/otra.md", note({ tipo: "cliente", titulo: "Archivada" }, "no indexar"));
    await new Promise((r) => setTimeout(r, 1200));
    expect(v.index.get("archivo/otra.md")).toBeUndefined();
  });
});

import { afterAll, describe, expect, it } from "vitest";
import { assertWritable, normalizeRel, resolveNotePath, ToolError } from "../src/paths.js";
import { createTestVault } from "./helpers/vault.js";

const v = createTestVault({ person: "ana" });
afterAll(() => v.cleanup());

describe("resolveNotePath", () => {
  it("acepta rutas relativas dentro de Org/ y normaliza", () => {
    const r = resolveNotePath(v.config, "./canónico//clientes/msd.md");
    expect(r.rel).toBe("canónico/clientes/msd.md");
    expect(r.folder).toBe("canónico");
    expect(r.abs.startsWith(v.orgPath)).toBe(true);
  });
  it.each(["../secreta.md", "canónico/../../fuera.md", "/etc/passwd", "C:\\x\\y.md", ".obsidian/workspace.md", ""])(
    "rechaza %s",
    (p) => {
      expect(() => resolveNotePath(v.config, p)).toThrow(ToolError);
    },
  );
  it("rechaza archivos que no sean .md", () => {
    expect(() => resolveNotePath(v.config, "adjuntos/foto.png")).toThrow(/\.md/);
  });
  it("normalizeRel convierte barras invertidas y NFC", () => {
    expect(normalizeRel("aportes\\ana\\x.md")).toBe("aportes/ana/x.md");
    expect(normalizeRel("cano\u0301nico/x.md")).toBe("canónico/x.md");
  });
});

describe("assertWritable", () => {
  it("permite aportes/<person>/", () => {
    expect(() => assertWritable(v.config, resolveNotePath(v.config, "aportes/ana/x.md"))).not.toThrow();
  });
  it("rechaza canónico/, otras personas y la raíz", () => {
    expect(() => assertWritable(v.config, resolveNotePath(v.config, "canónico/clientes/x.md"))).toThrow(/curador/);
    expect(() => assertWritable(v.config, resolveNotePath(v.config, "aportes/carlos-m/x.md"))).toThrow(/otra persona/);
    expect(() => assertWritable(v.config, resolveNotePath(v.config, "aportes/x.md"))).toThrow(ToolError);
    expect(() => assertWritable(v.config, resolveNotePath(v.config, "suelta.md"))).toThrow(ToolError);
  });
});

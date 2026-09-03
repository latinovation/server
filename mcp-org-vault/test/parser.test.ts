import { describe, expect, it } from "vitest";
import { countWords, extractSections, extractWikilinks, parseNote } from "../src/indexer/parser.js";

const full = `---
tipo: cliente
titulo: "MSD: contexto"
cliente: msd
tags: [farma, hubspot]
autor: ana
actualizado: 2026-09-03
fuente: humano
estado: validado
---

## Contexto
Texto de contexto con [[canónico/procesos/reporte-mensual|el proceso]] y [[otra#Sección]].

### Sub
Detalle.

## Contactos
Laura. ![[adjuntos/foto.png]] y [[otra]] repetido.
`;

describe("parseNote", () => {
  it("lee frontmatter completo y normaliza campos", () => {
    const n = parseNote(full, "canónico/clientes/msd.md");
    expect(n.tipo).toBe("cliente");
    expect(n.title).toBe("MSD: contexto");
    expect(n.cliente).toBe("msd");
    expect(n.tags).toEqual(["farma", "hubspot"]);
    expect(n.autor).toBe("ana");
    expect(n.estado).toBe("validado");
    expect(n.fuente).toBe("humano");
    expect(n.actualizado).toBe("2026-09-03"); // js-yaml lo parsea como Date; debe volver a string
    expect(n.warnings).toEqual([]);
    expect(n.body.startsWith("## Contexto")).toBe(true);
    expect(n.hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("extrae wikilinks sin alias ni encabezado y sin embeds ni duplicados", () => {
    const n = parseNote(full, "x.md");
    expect(n.links).toEqual(["canónico/procesos/reporte-mensual", "otra"]);
  });

  it("extrae secciones ## incluyendo sus subsecciones", () => {
    const n = parseNote(full, "x.md");
    const headings = n.sections.map((s) => s.heading);
    expect(headings).toEqual(["Contexto", "Sub", "Contactos"]);
    const contexto = n.sections.find((s) => s.heading === "Contexto")!;
    expect(contexto.content).toContain("Texto de contexto");
    expect(contexto.content).toContain("### Sub");
    expect(contexto.content).toContain("Detalle.");
    expect(contexto.content).not.toContain("Laura");
  });

  it("nota sin frontmatter: tipo null, título del primer encabezado y aviso", () => {
    const n = parseNote("# Nota suelta\n\nCuerpo.\n", "aportes/carlos-m/suelta.md");
    expect(n.tipo).toBeNull();
    expect(n.title).toBe("Nota suelta");
    expect(n.warnings).toContain("sin-frontmatter");
    expect(n.body).toContain("Cuerpo.");
  });

  it("nota sin frontmatter ni encabezado: título del nombre de archivo", () => {
    const n = parseNote("solo texto", "aportes/ana/2026-09-03-1402-cierre-msd.md");
    expect(n.title).toBe("cierre msd");
  });

  it("YAML inválido: no lanza, avisa y no indexa el bloque como cuerpo", () => {
    const n = parseNote("---\ntipo: [sin cerrar\ntitulo: x\n---\n\nCuerpo real.\n", "x.md");
    expect(n.tipo).toBeNull();
    expect(n.warnings.some((w) => w.startsWith("frontmatter-invalido"))).toBe(true);
    expect(n.body.trim()).toBe("Cuerpo real.");
  });

  it("tipo fuera del catálogo: tipo null y aviso", () => {
    const n = parseNote("---\ntipo: cosa\ntitulo: T\n---\nx", "x.md");
    expect(n.tipo).toBeNull();
    expect(n.warnings).toContain("tipo-invalido: cosa");
  });

  it("tags como string separada por comas o con #", () => {
    const n = parseNote("---\ntipo: proceso\ntitulo: T\ntags: '#a, b c'\n---\nx", "x.md");
    expect(n.tags).toEqual(["a", "b", "c"]);
  });

  it("avisa de cuerpo largo (> 500 palabras)", () => {
    const body = Array.from({ length: 520 }, (_, i) => `palabra${i}`).join(" ");
    const n = parseNote(`---\ntipo: proceso\ntitulo: T\n---\n${body}`, "x.md");
    expect(n.wordCount).toBe(520);
    expect(n.warnings.some((w) => w.startsWith("cuerpo-largo"))).toBe(true);
  });

  it("estado y actualizado inválidos generan avisos", () => {
    const n = parseNote("---\ntipo: proceso\ntitulo: T\nestado: listo\nactualizado: ayer\n---\nx", "x.md");
    expect(n.warnings).toContain("estado-invalido: listo");
    expect(n.warnings).toContain("actualizado-invalido");
  });
});

describe("helpers", () => {
  it("extractSections ignora encabezados dentro de bloques de código", () => {
    const s = extractSections("## A\n```\n## no es encabezado\n```\n## B\nb");
    expect(s.map((x) => x.heading)).toEqual(["A", "B"]);
  });
  it("extractWikilinks devuelve vacío si no hay enlaces", () => {
    expect(extractWikilinks("sin enlaces")).toEqual([]);
  });
  it("countWords ignora bloques de código y puntuación suelta", () => {
    expect(countWords("hola mundo — ... ```x y z``` fin")).toBe(3);
  });
});

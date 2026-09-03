import { describe, expect, it } from "vitest";
import { buildMatchQuery } from "../src/indexer/query.js";

describe("buildMatchQuery", () => {
  it("entrecomilla cada término (AND implícito)", () => {
    expect(buildMatchQuery("MSD HubSpot")).toBe('"MSD" "HubSpot"');
  });
  it("modo OR", () => {
    expect(buildMatchQuery("MSD HubSpot", "or")).toBe('"MSD" OR "HubSpot"');
  });
  it("conserva frases y prefijos", () => {
    expect(buildMatchQuery('"reporte mensual" hub*')).toBe('"reporte mensual" "hub"*');
  });
  it("neutraliza operadores y puntuación de FTS5", () => {
    expect(buildMatchQuery("msd: (hubspot) NOT -x ^y")).toBe('"msd" "hubspot" "NOT" "x" "y"');
  });
  it("devuelve null si no hay términos", () => {
    expect(buildMatchQuery("   ")).toBeNull();
    expect(buildMatchQuery("() - :")).toBeNull();
  });
  it("mantiene acentos y guiones internos", () => {
    expect(buildMatchQuery("canónico carlos-m")).toBe('"canónico" "carlos-m"');
  });
});

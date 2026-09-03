/**
 * Convierte la consulta libre del usuario en una expresión FTS5 segura.
 * - Frases entre comillas se conservan como frases.
 * - Cada término suelto se entrecomilla (evita que `-`, `:` o paréntesis se interpreten como operadores).
 * - Un `*` al final de un término activa búsqueda por prefijo: `hub*`.
 * Devuelve null si no queda ningún término útil.
 */
export function buildMatchQuery(query: string, mode: "and" | "or" = "and"): string | null {
  const parts: string[] = [];
  let rest = query.normalize("NFC");

  rest = rest.replace(/"([^"]+)"/g, (_m, phrase: string) => {
    const cleaned = phrase.replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
    if (cleaned) parts.push(`"${cleaned}"`);
    return " ";
  });

  for (const raw of rest.split(/\s+/)) {
    const prefix = raw.endsWith("*");
    const core = raw.replace(/[^\p{L}\p{N}'-]/gu, "").replace(/^-+|-+$/g, "");
    if (!core) continue;
    parts.push(`"${core}"${prefix ? "*" : ""}`);
  }

  if (parts.length === 0) return null;
  return parts.join(mode === "and" ? " " : " OR ");
}

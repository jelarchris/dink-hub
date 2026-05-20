/**
 * Title-case for user-entered place names that may arrive in mixed casing
 * (e.g. "CABADBARAN CITY", "cabadbaran city", "Cabadbaran City") so they
 * collapse to a single canonical display label.
 *
 * Conservative: only changes the first letter of each whitespace- or
 * hyphen-separated token. Leaves separators and non-letter characters alone.
 */
export function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) =>
      part.length > 0 && /[a-z]/.test(part[0]!) ? part[0]!.toUpperCase() + part.slice(1) : part,
    )
    .join("");
}

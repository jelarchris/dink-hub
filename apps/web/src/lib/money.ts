/**
 * Money is stored as bigint centavos (PHP). Never use float for arithmetic.
 * Display via formatPHP at the UI boundary only.
 */

const PHP_FORMATTER = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPHP(centavos: bigint | number): string {
  const value = typeof centavos === "bigint" ? Number(centavos) / 100 : centavos / 100;
  return PHP_FORMATTER.format(value);
}

export function pesosToCentavos(pesos: number): bigint {
  // Round to avoid float drift before converting to integer centavos
  return BigInt(Math.round(pesos * 100));
}

export function centavosToPesos(centavos: bigint): number {
  return Number(centavos) / 100;
}

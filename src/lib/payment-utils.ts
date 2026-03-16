export function parseCurrencyLikeValue(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  const directParsed = Number(raw);
  if (Number.isFinite(directParsed)) return directParsed;

  let normalized = raw.replace(/[^[\d.,\-+eE]]/g, "");
  normalized = normalized.replace(/[^\d.,\-+eE]/g, "");
  if (!normalized) return 0;

  const hasScientificNotation = /e/i.test(normalized);
  if (hasScientificNotation) {
    const scientificParsed = Number(normalized.replace(/,/g, ""));
    if (Number.isFinite(scientificParsed)) return scientificParsed;
  }

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = normalized.split(thousandsSeparator).join("");
    normalized = decimalSeparator === "," ? normalized.replace(",", ".") : normalized;
  } else if (lastComma !== -1) {
    const commaCount = (normalized.match(/,/g) || []).length;
    normalized = commaCount > 1 ? normalized.replace(/,/g, "") : normalized.replace(",", ".");
  } else if (lastDot !== -1) {
    const dotCount = (normalized.match(/\./g) || []).length;
    normalized = dotCount > 1 ? normalized.replace(/\./g, "") : normalized;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateTotalPagos(mayorOferta: number, totalProrrateoGastos: number): number {
  return mayorOferta + totalProrrateoGastos;
}

export function calculateSaldoPendiente(totalPagos: number, totalSoportes: number): number {
  return totalPagos - totalSoportes;
}

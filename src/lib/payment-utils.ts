const integerFormatter = new Intl.NumberFormat("es-CO", {
  maximumFractionDigits: 0,
});

export function formatNumericInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  const raw = String(value).replace(/[^\d.,]/g, "").trim();
  if (!raw) return "";

  if (raw.includes(",")) {
    const [integerPartRaw, ...decimalParts] = raw.split(",");
    const integerDigits = integerPartRaw.replace(/\D/g, "");
    const decimalDigits = decimalParts.join("").replace(/\D/g, "").slice(0, 2);
    const formattedInteger = integerDigits ? integerFormatter.format(Number(integerDigits)) : "0";

    if (raw.endsWith(",") && decimalDigits.length === 0) {
      return `${formattedInteger},`;
    }

    return decimalDigits ? `${formattedInteger},${decimalDigits}` : formattedInteger;
  }

  const dotMatches = raw.match(/\./g) || [];
  if (dotMatches.length === 1) {
    const [integerPartRaw = "", decimalPartRaw = ""] = raw.split(".");
    const integerDigits = integerPartRaw.replace(/\D/g, "");
    const decimalDigits = decimalPartRaw.replace(/\D/g, "").slice(0, 2);

    if (decimalPartRaw.length <= 2) {
      const formattedInteger = integerDigits ? integerFormatter.format(Number(integerDigits)) : "0";
      if (raw.endsWith(".") && decimalDigits.length === 0) {
        return `${formattedInteger},`;
      }
      return decimalDigits ? `${formattedInteger},${decimalDigits}` : formattedInteger;
    }
  }

  const integerDigits = raw.replace(/\D/g, "");
  return integerDigits ? integerFormatter.format(Number(integerDigits)) : "";
}

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
    const decimalPart = normalized.split(",").pop() || "";
    normalized = commaCount === 1 && decimalPart.length > 0 && decimalPart.length <= 2
      ? normalized.replace(",", ".")
      : normalized.replace(/,/g, "");
  } else if (lastDot !== -1) {
    const dotCount = (normalized.match(/\./g) || []).length;
    const decimalPart = normalized.split(".").pop() || "";
    normalized = dotCount === 1 && decimalPart.length > 0 && decimalPart.length <= 2
      ? normalized
      : normalized.replace(/\./g, "");
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

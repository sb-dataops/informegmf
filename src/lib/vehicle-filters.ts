const ALLOWED_ESTADOS = new Set([
  "VENTA",
  "CONDICIONAL APROBADO",
  "POST-OFERTA APROBADA",
]);

export function isAllowedEstado(estado: string | null | undefined): boolean {
  return ALLOWED_ESTADOS.has((estado || "").trim().toUpperCase());
}

export function isCondicionalRechazado(estado: string | null | undefined): boolean {
  return !isAllowedEstado(estado);
}

export function normalizePlaca(placa: string | null | undefined): string {
  return (placa || "").trim().toUpperCase();
}

export function normalizeSearchText(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function matchesNormalizedSearch(value: string | null | undefined, query: string | null | undefined): boolean {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedValue || !normalizedQuery) return false;

  return normalizedValue === normalizedQuery || normalizedValue.includes(normalizedQuery) || normalizedQuery.includes(normalizedValue);
}

export function buildAllowedPlacasFromRelatorio<T extends { placa: string | null; estado: string | null }>(rows: T[]): Set<string> {
  return new Set(
    rows
      .filter((row) => !!row.placa && isAllowedEstado(row.estado))
      .map((row) => normalizePlaca(row.placa)),
  );
}

export function isAllowedPlaca(placa: string | null | undefined, allowedPlacas: Set<string>): boolean {
  const normalized = normalizePlaca(placa);
  return !!normalized && allowedPlacas.has(normalized);
}

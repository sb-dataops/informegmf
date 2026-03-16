export function isCondicionalRechazado(estado: string | null | undefined): boolean {
  return (estado || "").toUpperCase().includes("CONDICIONAL RECHAZADO");
}

export function normalizePlaca(placa: string | null | undefined): string {
  return (placa || "").trim().toUpperCase();
}

export function buildAllowedPlacasFromRelatorio<T extends { placa: string | null; estado: string | null }>(rows: T[]): Set<string> {
  return new Set(
    rows
      .filter((row) => !!row.placa && !isCondicionalRechazado(row.estado))
      .map((row) => normalizePlaca(row.placa)),
  );
}

export function isAllowedPlaca(placa: string | null | undefined, allowedPlacas: Set<string>): boolean {
  const normalized = normalizePlaca(placa);
  return !!normalized && allowedPlacas.has(normalized);
}

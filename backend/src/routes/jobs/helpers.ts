// Types y helpers compartidos entre los handlers de /jobs/*.

export interface PagoRow {
  placa: string;
  subasta: string | null;
  total_pagos: number | null;
}

export interface PagoWithDeadlineRow extends PagoRow {
  fecha_limite_pago: string | null;
}

export interface DocRow {
  placas: string[];
  valor_soporte: number;
}

// Today's date in Colombia timezone (YYYY-MM-DD).
export function todayColombia(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

// Build a map placa (uppercase) -> total valor soporte sumado.
// Si filterPlacas se pasa, solo incluye placas listadas (case-insensitive).
export function buildSoportesByPlaca(
  docs: DocRow[],
  filterPlacas?: string[],
): Map<string, number> {
  const filterSet = filterPlacas
    ? new Set(filterPlacas.map((p) => p.toUpperCase()))
    : null;
  const out = new Map<string, number>();
  for (const d of docs) {
    const valor = Number(d.valor_soporte) || 0;
    for (const p of d.placas ?? []) {
      const key = p.toUpperCase();
      if (filterSet && !filterSet.has(key)) continue;
      out.set(key, (out.get(key) ?? 0) + valor);
    }
  }
  return out;
}

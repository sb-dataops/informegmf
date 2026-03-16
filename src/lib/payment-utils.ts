export function parseCurrencyLikeValue(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const cleaned = String(value).replace(/[^\d,-.]/g, "").replace(/\.(?=.*\.)/g, "").replace(/,/g, ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateTotalPagos(mayorOferta: number, totalProrrateoGastos: number): number {
  return mayorOferta + totalProrrateoGastos;
}

export function calculateSaldoPendiente(totalPagos: number, totalSoportes: number): number {
  return totalPagos - totalSoportes;
}

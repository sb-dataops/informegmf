export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  // Manejar varios formatos de fecha que vienen de BigQuery.
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return date; // Si no parsea, devolver tal cual.
  // Usar UTC para evitar shifts de timezone (BigQuery devuelve dates date-only, no datetime).
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

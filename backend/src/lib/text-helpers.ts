export function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9\s\-_.áéíóúñÁÉÍÓÚÑ()]/g, '').substring(0, 100);
}

export function normalizeSearchText(value: string | null | undefined): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .substring(0, 100);
}

export function normalizePlaca(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

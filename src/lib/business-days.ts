// Colombian public holidays (fixed + movable for 2025-2026)
// Movable holidays follow "Ley Emiliani" — moved to the next Monday
const COLOMBIAN_HOLIDAYS: string[] = [
  // 2025
  "2025-01-01","2025-01-06","2025-03-24","2025-04-17","2025-04-18",
  "2025-06-02","2025-06-23","2025-06-30","2025-07-20","2025-08-07",
  "2025-08-18","2025-10-13","2025-11-03","2025-11-17","2025-12-08","2025-12-25",
  // 2026
  "2026-01-01","2026-01-12","2026-03-23","2026-04-02","2026-04-03",
  "2026-05-18","2026-06-15","2026-06-22","2026-07-20","2026-08-07",
  "2026-08-17","2026-10-12","2026-11-02","2026-11-16","2026-12-08","2026-12-25",
];

const holidaySet = new Set(COLOMBIAN_HOLIDAYS);

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isBusinessDay(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !holidaySet.has(toDateStr(d));
}

/**
 * Add N business days (Colombian calendar) to a date string.
 * Returns ISO date string (YYYY-MM-DD) or null if input is invalid.
 */
export function addBusinessDays(dateStr: string, days: number): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return null;

  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d)) added++;
  }
  return toDateStr(d);
}

/**
 * Count business days elapsed between a date string and today (Colombian calendar).
 * Returns null if input is invalid.
 */
export function countBusinessDaysSince(dateStr: string): number | null {
  if (!dateStr) return null;
  const start = new Date(dateStr + "T12:00:00");
  if (isNaN(start.getTime())) return null;

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  if (start >= today) return 0;

  let count = 0;
  const d = new Date(start);
  while (true) {
    d.setDate(d.getDate() + 1);
    if (d > today) break;
    if (isBusinessDay(d)) count++;
  }
  return count;
}

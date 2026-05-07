export const DASHBOARD_STATS_TTL_MS = 2 * 60 * 1000;
export const FILTER_RESULT_TTL_MS = 2 * 60 * 1000;

type DashboardStatsCache = { stats: Record<string, string>; expiresAt: number } | null;

let dashboardStatsCache: DashboardStatsCache = null;

export function getDashboardStatsCache(): DashboardStatsCache {
  return dashboardStatsCache;
}

export function setDashboardStatsCache(value: DashboardStatsCache) {
  dashboardStatsCache = value;
}

export const filterResultsCache = new Map<string, { payload: string; expiresAt: number }>();

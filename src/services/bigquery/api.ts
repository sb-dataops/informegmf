import {
  SearchResult,
  DashboardStatsData,
  FilteredLotsResult,
} from "@/types";
import { apiFetch } from "@/lib/api-client";

const FUNCTION_NAME = "fetch-bigquery";

export async function searchBigQuery(query: string): Promise<SearchResult> {
  const res = await apiFetch(
    `/${FUNCTION_NAME}?action=search&q=${encodeURIComponent(query)}`,
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error en la búsqueda");
  }
  return res.json();
}

export async function fetchDashboardStats(): Promise<DashboardStatsData> {
  const res = await apiFetch(`/${FUNCTION_NAME}?action=stats`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error obteniendo estadísticas");
  }
  const result = await res.json();
  return result.stats;
}

async function fetchStatSection(
  actionName: string,
): Promise<Record<string, string>> {
  const res = await apiFetch(`/${FUNCTION_NAME}?action=${actionName}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || `Error obteniendo ${actionName}`);
  }
  return res.json();
}

export const fetchStatsPagos = () => fetchStatSection("stats_pagos");
export const fetchStatsRetiros = () => fetchStatSection("stats_retiros");
export const fetchStatsFiltros = () => fetchStatSection("stats_filtros");

export async function fetchFilteredLots(
  category: string,
): Promise<FilteredLotsResult> {
  const res = await apiFetch(
    `/${FUNCTION_NAME}?action=filter&category=${encodeURIComponent(category)}`,
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Error obteniendo datos filtrados");
  }
  return res.json();
}

import type { Context } from "hono";
import { FILTER_RESULT_TTL_MS, filterResultsCache } from "../../caches.js";
import { getPendientesFiltros } from "../../helpers.js";

export async function handlePendientesFiltros(c: Context, category: string, canUseFilterCache: boolean) {
  const pendientesFiltrosRows = await getPendientesFiltros();
  const rows = pendientesFiltrosRows.map((r) => ({
    subasta: r.subasta,
    placa: r.placa,
    comprador: r.comprador,
    documento: null,
    descripcion: r.descripcion,
    estado: r.estadoRelatorio || "",
    lote: r.lote,
    tramitador: r.tramitador,
  }));
  const payload = JSON.stringify({ category, rows, count: rows.length });
  if (canUseFilterCache) {
    filterResultsCache.set(category, { payload, expiresAt: Date.now() + FILTER_RESULT_TTL_MS });
  }
  c.header("Content-Type", "application/json");
  return c.body(payload);
}

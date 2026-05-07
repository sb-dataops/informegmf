import type { Context } from "hono";
import { runQuery } from "../../../services/bigquery.js";
import { FILTER_RESULT_TTL_MS, filterResultsCache } from "../caches.js";
import { handlePagosPendientesRevision } from "./filter-categories/pagos-pendientes-revision.js";
import { handleSoportesPendientesRevision } from "./filter-categories/soportes-pendientes-revision.js";
import { handlePendientesPago } from "./filter-categories/pendientes-pago.js";
import { handlePendientesFiltros } from "./filter-categories/pendientes-filtros.js";
import { getPendientesTraspasoSql } from "./filter-categories/pendientes-traspaso.js";
import { getPendientesRetiroSql } from "./filter-categories/pendientes-retiro.js";
import { getVehiculosEntregadosSql } from "./filter-categories/vehiculos-entregados.js";
import { getAprobadosSql } from "./filter-categories/aprobados.js";
import { getEnProcesoSql } from "./filter-categories/en-proceso.js";
import { getTotalSql } from "./filter-categories/total.js";

// ── FILTER: get rows by category for dashboard drill-down ──
export async function handleFilter(c: Context) {
  const category = c.req.query("category") || "";
  const canUseFilterCache = category !== "pagos_pendientes_revision" && category !== "soportes_pendientes_revision";
  const cachedFilter = canUseFilterCache ? filterResultsCache.get(category) : null;
  if (cachedFilter && cachedFilter.expiresAt > Date.now()) {
    c.header("Cache-Control", "public, max-age=30, s-maxage=120");
    c.header("Content-Type", "application/json");
    return c.body(cachedFilter.payload);
  }

  if (category === "pagos_pendientes_revision") {
    return handlePagosPendientesRevision(c, category);
  }

  if (category === "soportes_pendientes_revision") {
    return handleSoportesPendientesRevision(c, category);
  }

  let sql = "";
  if (category === "pendientes_traspaso") {
    sql = getPendientesTraspasoSql();
  } else if (category === "pendientes_pago") {
    return handlePendientesPago(c, category, canUseFilterCache);
  } else if (category === "pendientes_retiro") {
    sql = getPendientesRetiroSql();
  } else if (category === "vehiculos_entregados") {
    sql = getVehiculosEntregadosSql();
  } else if (category === "aprobados") {
    sql = getAprobadosSql();
  } else if (category === "en_proceso") {
    sql = getEnProcesoSql();
  } else if (category === "pendientes_filtros") {
    return handlePendientesFiltros(c, category, canUseFilterCache);
  } else if (category === "total") {
    sql = getTotalSql();
  } else {
    return c.json({ error: "Categoría no válida" }, 400);
  }

  const rows = await runQuery(sql);
  const payload = JSON.stringify({ category, rows, count: rows.length });
  if (canUseFilterCache) {
    filterResultsCache.set(category, {
      payload,
      expiresAt: Date.now() + FILTER_RESULT_TTL_MS,
    });
  }
  c.header("Cache-Control", "public, max-age=30, s-maxage=120");
  c.header("Content-Type", "application/json");
  return c.body(payload);
}
